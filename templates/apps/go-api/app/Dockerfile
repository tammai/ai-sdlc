# syntax=docker/dockerfile:1
ARG GO_VERSION=1.27

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
COPY . .
# Cache mounts keep module + build caches between builds; only packages imported by the server are fetched.
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/server /server
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
