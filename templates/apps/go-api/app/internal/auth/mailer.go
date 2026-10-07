package auth

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// Message is a plain-text email.
type Message struct {
	To      string
	Subject string
	Text    string
}

// Mailer sends email. Add a provider (SES, Postmark, Resend, ...) by implementing it and selecting
// it in cmd/server (MAGIC_LINK=<name>).
type Mailer interface {
	Send(ctx context.Context, m Message) error
}

// LogMailer prints emails (including the sign-in link) to the log. Local development only:
// config refuses MAGIC_LINK=log when APP_ENV=production, because links are bearer secrets.
type LogMailer struct{ Log *slog.Logger }

// Send logs the message.
func (l LogMailer) Send(ctx context.Context, m Message) error {
	l.Log.WarnContext(ctx, "DEV MAILER (MAGIC_LINK=log): email not sent, printed instead",
		"to", MaskEmail(m.To), "subject", m.Subject, "text", m.Text)
	return nil
}

// SMTPMailer sends through an SMTP relay with STARTTLS (port 587) or implicit TLS (port 465).
// Plaintext is only allowed to a loopback host (e.g. a local Mailpit).
type SMTPMailer struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	Timeout  time.Duration // default 15s
}

// Send delivers m.
func (s SMTPMailer) Send(ctx context.Context, m Message) error {
	for _, v := range []string{s.From, m.To, m.Subject} {
		if strings.ContainsAny(v, "\r\n") {
			return errors.New("smtp: header value contains a line break")
		}
	}
	from, err := mail.ParseAddress(s.From)
	if err != nil {
		return fmt.Errorf("smtp: SMTP_FROM: %w", err)
	}
	timeout := s.Timeout
	if timeout == 0 {
		timeout = 15 * time.Second
	}
	addr := net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
	tlsConf := &tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12}
	dialer := &net.Dialer{Timeout: timeout}
	var conn net.Conn
	if s.Port == 465 {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: tlsConf}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp: dial: %w", err)
	}
	deadline := time.Now().Add(timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)
	c, err := smtp.NewClient(conn, s.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp: hello: %w", err)
	}
	defer func() { _ = c.Close() }()
	if s.Port != 465 {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(tlsConf); err != nil {
				return fmt.Errorf("smtp: starttls: %w", err)
			}
		} else if !isLoopback(s.Host) {
			return errors.New("smtp: server does not offer STARTTLS; refusing to send in plaintext")
		}
	}
	if s.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", s.Username, s.Password, s.Host)); err != nil {
			return fmt.Errorf("smtp: auth: %w", err)
		}
	}
	if err := c.Mail(from.Address); err != nil {
		return fmt.Errorf("smtp: MAIL FROM: %w", err)
	}
	if err := c.Rcpt(m.To); err != nil {
		return fmt.Errorf("smtp: RCPT TO: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp: DATA: %w", err)
	}
	var b bytes.Buffer
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\n", from.String(), m.To, mimeHeader(m.Subject), time.Now().UTC().Format(time.RFC1123Z))
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
	b.WriteString(m.Text)
	if _, err := w.Write(b.Bytes()); err != nil {
		return fmt.Errorf("smtp: write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp: end data: %w", err)
	}
	return c.Quit()
}

func mimeHeader(s string) string {
	for _, r := range s {
		if r > 127 {
			return mime.QEncoding.Encode("utf-8", s)
		}
	}
	return s
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
