package auth

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"__GO_MODULE__/internal/api/gen"
	"__GO_MODULE__/internal/problem"
)

// Magic-link token length bounds from the contract (TokenRequest.token, magic-link/verify token).
const (
	MinLinkTokenLen = 16
	MaxLinkTokenLen = 512
)

// Handler implements the auth operations of gen.StrictServerInterface: decode, call the service,
// map errors to problem+json. Cookies and redirects are written by the response types below.
type Handler struct{ svc *Service }

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetAuthProviders implements GET /v1/auth/providers.
func (h *Handler) GetAuthProviders(context.Context, gen.GetAuthProvidersRequestObject) (gen.GetAuthProvidersResponseObject, error) {
	o := h.svc.opts
	out := gen.GetAuthProviders200JSONResponse{
		Password:     o.PasswordEnabled,
		Registration: o.PasswordEnabled && o.RegistrationOpen,
		MagicLink:    h.svc.MagicLinkEnabled(),
		Oidc: []struct {
			Id   string `json:"id"`
			Name string `json:"name"`
		}{},
	}
	for _, p := range h.svc.Providers() {
		out.Oidc = append(out.Oidc, struct {
			Id   string `json:"id"`
			Name string `json:"name"`
		}{Id: p.ID, Name: p.Name})
	}
	return out, nil
}

// Register implements POST /v1/auth/register (web: sets the session cookie).
func (h *Handler) Register(ctx context.Context, req gen.RegisterRequestObject) (gen.RegisterResponseObject, error) {
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	name := ""
	if req.Body.Name != nil {
		name = *req.Body.Name
	}
	u, err := h.svc.Register(ctx, string(req.Body.Email), req.Body.Password, name)
	if err != nil {
		return nil, toProblem(err)
	}
	c, err := h.startWeb(ctx, u)
	if err != nil {
		return nil, err
	}
	return gen.Register201JSONResponse{Body: toAPIUser(u), Headers: gen.Register201ResponseHeaders{SetCookie: &c}}, nil
}

// CreateSession implements POST /v1/auth/session (web password sign-in).
func (h *Handler) CreateSession(ctx context.Context, req gen.CreateSessionRequestObject) (gen.CreateSessionResponseObject, error) {
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	u, err := h.svc.PasswordSignIn(ctx, string(req.Body.Email), req.Body.Password)
	if err != nil {
		return nil, toProblem(err)
	}
	c, err := h.startWeb(ctx, u)
	if err != nil {
		return nil, err
	}
	return gen.CreateSession200JSONResponse{Body: toAPIUser(u), Headers: gen.CreateSession200ResponseHeaders{SetCookie: &c}}, nil
}

// DeleteSession implements DELETE /v1/auth/session (sign-out; requires authentication).
func (h *Handler) DeleteSession(ctx context.Context, _ gen.DeleteSessionRequestObject) (gen.DeleteSessionResponseObject, error) {
	p, ok := PrincipalFrom(ctx)
	if !ok {
		return nil, toProblem(ErrUnauthenticated)
	}
	if err := h.svc.SignOut(ctx, p.SessionID, p.UserID); err != nil {
		return nil, err
	}
	clear := h.svc.ClearSessionCookie().String()
	return gen.DeleteSession204Response{Headers: gen.DeleteSession204ResponseHeaders{SetCookie: &clear}}, nil
}

// GetMe implements GET /v1/auth/me.
func (h *Handler) GetMe(ctx context.Context, _ gen.GetMeRequestObject) (gen.GetMeResponseObject, error) {
	p, ok := PrincipalFrom(ctx)
	if !ok {
		return nil, toProblem(ErrUnauthenticated)
	}
	u, err := h.svc.User(ctx, p.UserID)
	if errors.Is(err, ErrNotFound) {
		return nil, toProblem(ErrUnauthenticated)
	}
	if err != nil {
		return nil, err
	}
	return gen.GetMe200JSONResponse(toAPIUser(u)), nil
}

// CreateToken implements POST /v1/auth/token (native clients).
func (h *Handler) CreateToken(ctx context.Context, req gen.CreateTokenRequestObject) (gen.CreateTokenResponseObject, error) {
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	b := req.Body
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	var (
		t   Tokens
		u   User
		err error
	)
	switch b.GrantType {
	case gen.TokenRequestGrantTypePassword:
		if b.Email == nil || b.Password == nil {
			return nil, toProblem(&ValidationError{Detail: "email and password are required for grantType=password"})
		}
		if u, err = h.svc.PasswordSignIn(ctx, string(*b.Email), *b.Password); err == nil {
			t, err = h.svc.IssueNativeTokens(ctx, u)
		}
	case gen.TokenRequestGrantTypeRefreshToken:
		if str(b.RefreshToken) == "" {
			return nil, toProblem(&ValidationError{Detail: "refreshToken is required for grantType=refresh_token"})
		}
		t, err = h.svc.Refresh(ctx, *b.RefreshToken)
	case gen.TokenRequestGrantTypeMagicLink:
		if n := len(str(b.Token)); n < MinLinkTokenLen || n > MaxLinkTokenLen {
			return nil, toProblem(&ValidationError{Detail: "token must be 16 to 512 characters for grantType=magic_link"})
		}
		if u, err = h.svc.ConsumeMagicLink(ctx, *b.Token, ClientNative); err == nil {
			t, err = h.svc.IssueNativeTokens(ctx, u)
		}
	case gen.TokenRequestGrantTypeAuthorizationCode:
		if str(b.Code) == "" {
			return nil, toProblem(&ValidationError{Detail: "code is required for grantType=authorization_code"})
		}
		// The verifier is checked after the code is consumed (a wrong or missing one burns the code).
		if u, err = h.svc.ExchangeAuthCode(ctx, *b.Code, str(b.CodeVerifier)); err == nil {
			t, err = h.svc.IssueNativeTokens(ctx, u)
		}
	default:
		return nil, toProblem(&ValidationError{Detail: "unsupported grantType"})
	}
	if err != nil {
		return nil, toProblem(err)
	}
	return gen.CreateToken200JSONResponse(gen.TokenResponse{
		AccessToken: t.AccessToken, RefreshToken: t.RefreshToken, TokenType: gen.TokenResponseTokenTypeBearer,
		ExpiresIn: t.ExpiresIn, User: toAPIUser(t.User),
	}), nil
}

// RevokeToken implements POST /v1/auth/token/revoke (idempotent).
func (h *Handler) RevokeToken(ctx context.Context, req gen.RevokeTokenRequestObject) (gen.RevokeTokenResponseObject, error) {
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	if err := h.svc.RevokeRefreshToken(ctx, req.Body.RefreshToken); err != nil {
		return nil, err
	}
	return gen.RevokeToken204Response{}, nil
}

// RequestMagicLink implements POST /v1/auth/magic-link (always 202 when enabled and well-formed).
func (h *Handler) RequestMagicLink(ctx context.Context, req gen.RequestMagicLinkRequestObject) (gen.RequestMagicLinkResponseObject, error) {
	if !h.svc.MagicLinkEnabled() {
		return nil, toProblem(ErrDisabled)
	}
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	client := ClientWeb
	if req.Body.Client != nil {
		client = Client(*req.Body.Client)
	}
	if err := h.svc.RequestMagicLink(ctx, string(req.Body.Email), client); err != nil {
		return nil, toProblem(err)
	}
	return gen.RequestMagicLink202Response{}, nil
}

// VerifyMagicLink implements POST /v1/auth/magic-link/verify (web; sets the session cookie).
func (h *Handler) VerifyMagicLink(ctx context.Context, req gen.VerifyMagicLinkRequestObject) (gen.VerifyMagicLinkResponseObject, error) {
	if !h.svc.MagicLinkEnabled() {
		return nil, toProblem(ErrDisabled)
	}
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	if n := len(req.Body.Token); n < MinLinkTokenLen || n > MaxLinkTokenLen {
		return nil, toProblem(&ValidationError{Detail: "token must be 16 to 512 characters"})
	}
	u, err := h.svc.ConsumeMagicLink(ctx, req.Body.Token, ClientWeb)
	if err != nil {
		return nil, toProblem(err)
	}
	c, err := h.startWeb(ctx, u)
	if err != nil {
		return nil, err
	}
	return gen.VerifyMagicLink200JSONResponse{Body: toAPIUser(u), Headers: gen.VerifyMagicLink200ResponseHeaders{SetCookie: &c}}, nil
}

// StartOidc implements GET /v1/auth/oidc/{provider}/start.
func (h *Handler) StartOidc(ctx context.Context, req gen.StartOidcRequestObject) (gen.StartOidcResponseObject, error) {
	client := ClientWeb
	if req.Params.Client != nil {
		client = Client(*req.Params.Client)
	}
	redirect := ""
	if req.Params.Redirect != nil {
		redirect = *req.Params.Redirect
	}
	challenge, method := "", ""
	if req.Params.CodeChallenge != nil {
		challenge = *req.Params.CodeChallenge
	}
	if req.Params.CodeChallengeMethod != nil {
		method = string(*req.Params.CodeChallengeMethod)
	}
	start, err := h.svc.StartOIDC(ctx, req.Provider, client, redirect, challenge, method)
	var oe *OIDCError
	if errors.As(err, &oe) { // native request with a bad PKCE challenge: back to the allow-listed app URI
		loc := h.svc.OIDCErrorRedirect(oe)
		return gen.StartOidc302Response{Headers: gen.StartOidc302ResponseHeaders{Location: &loc}}, nil
	}
	if err != nil {
		return nil, toProblem(err)
	}
	// Custom response: the contract declares only Location here, but the state must also be bound to
	// the browser with a Set-Cookie (login-CSRF defense).
	return startRedirect{location: start.AuthURL, binding: h.bindingCookie(start.State, OIDCStateTTL)}, nil
}

// OidcCallback implements GET /v1/auth/oidc/{provider}/callback.
func (h *Handler) OidcCallback(ctx context.Context, req gen.OidcCallbackRequestObject) (gen.OidcCallbackResponseObject, error) {
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	redirect := func(location, setCookie string) gen.OidcCallback302Response {
		return gen.OidcCallback302Response{Headers: gen.OidcCallback302ResponseHeaders{Location: &location, SetCookie: &setCookie}}
	}
	clear := h.bindingCookie("", -1).String()
	res, err := h.svc.FinishOIDC(ctx, req.Provider, str(req.Params.Code), str(req.Params.State), str(req.Params.Error),
		cookieValue(ctx, h.bindingCookieName()))
	var oe *OIDCError
	if errors.As(err, &oe) {
		return redirect(h.svc.OIDCErrorRedirect(oe), clear), nil
	}
	if err != nil {
		return nil, toProblem(err)
	}
	if res.Client == ClientNative {
		code, err := h.svc.IssueAuthCode(ctx, res.User.ID, res.ClientChallenge)
		if err != nil {
			return nil, err
		}
		return redirect(NativeCodeRedirect(res.Redirect, code), clear), nil
	}
	c, err := h.startWeb(ctx, res.User)
	if err != nil {
		return nil, err
	}
	// One Set-Cookie only (the generated type sets a single header): the session cookie. The binding
	// cookie is left to expire (max 10 minutes); its state was consumed above and is worthless now.
	return redirect(h.svc.WebLanding(res.Redirect), c), nil
}

// startWeb creates a web session (ending the browser's previous one, if any) and returns its
// Set-Cookie header value.
func (h *Handler) startWeb(ctx context.Context, u User) (string, error) {
	if prev := cookieValue(ctx, h.svc.opts.CookieName); prev != "" {
		if p, _, err := h.svc.Authenticate(ctx, prev, ClientWeb); err == nil {
			_ = h.svc.SignOut(ctx, p.SessionID, p.UserID)
		}
	}
	token, exp, err := h.svc.StartWebSession(ctx, u.ID)
	if err != nil {
		return "", err
	}
	h.svc.audit(ctx, slog.LevelInfo, "auth.session_started", "user_id", u.ID, "kind", ClientWeb)
	return h.svc.SessionCookie(token, exp).String(), nil
}

func (h *Handler) bindingCookieName() string { return h.svc.opts.CookieName + "_oidc" }

// bindingCookie ties an OIDC state to the browser that started the flow (login-CSRF defense).
func (h *Handler) bindingCookie(state string, ttl time.Duration) *http.Cookie {
	c := &http.Cookie{ //nolint:gosec // Secure follows COOKIE_SECURE, which config forces on when APP_ENV=production
		Name: h.bindingCookieName(), Value: state, Path: "/", HttpOnly: true, Secure: h.svc.opts.CookieSecure,
		SameSite: http.SameSiteLaxMode, MaxAge: int(ttl / time.Second),
	}
	if ttl < 0 {
		c.MaxAge = -1
	}
	return c
}

func toAPIUser(u User) gen.User {
	out := gen.User{Id: u.ID, Email: openapi_types.Email(u.Email)}
	if u.Name != "" {
		name := u.Name
		out.Name = &name
	}
	return out
}

// toProblem maps domain errors to client-safe problems; unknown errors pass through (500, logged).
func toProblem(err error) error {
	var ve *ValidationError
	switch {
	case errors.As(err, &ve):
		return problem.New(http.StatusUnprocessableEntity, ve.Detail)
	case errors.Is(err, ErrDisabled), errors.Is(err, ErrUnknownProvider):
		return problem.New(http.StatusNotFound, err.Error())
	case errors.Is(err, ErrRegistrationClosed):
		return problem.New(http.StatusForbidden, err.Error())
	case errors.Is(err, ErrInvalidCredentials), errors.Is(err, ErrInvalidGrant), errors.Is(err, ErrUnauthenticated):
		return problem.New(http.StatusUnauthorized, err.Error())
	case errors.Is(err, ErrEmailTaken):
		return problem.New(http.StatusConflict, err.Error())
	case errors.Is(err, ErrRateLimited):
		p := problem.New(http.StatusTooManyRequests, err.Error())
		secs := 1
		var rl *RateLimitError
		if errors.As(err, &rl) {
			secs = max(1, int(math.Ceil(rl.RetryAfter.Seconds())))
		}
		p.Header = http.Header{"Retry-After": {strconv.Itoa(secs)}}
		return p
	case errors.Is(err, ErrOIDCState):
		return problem.New(http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrIdentityProvider):
		return problem.New(http.StatusBadGateway, err.Error())
	}
	return err
}

// ---- response types -------------------------------------------------------------------------
// Generated types are used wherever the contract declares the headers; Cache-Control: no-store and
// Referrer-Policy: no-referrer come from server.secureHeaders.

// startRedirect is the 302 to the IdP plus the state-binding cookie.
type startRedirect struct {
	location string
	binding  *http.Cookie
}

func (r startRedirect) VisitStartOidcResponse(w http.ResponseWriter) error {
	http.SetCookie(w, r.binding)
	w.Header().Set("Location", r.location)
	w.WriteHeader(http.StatusFound)
	return nil
}
