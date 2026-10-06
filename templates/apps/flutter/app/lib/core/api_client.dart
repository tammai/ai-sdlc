import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:__APP_SNAKE__/core/config.dart';

/// Persists auth tokens in the platform keystore/keychain. Never log tokens.
class TokenStore {
  TokenStore(this._storage);

  static const _accessTokenKey = 'access_token';

  final FlutterSecureStorage _storage;

  Future<String?> readAccessToken() => _storage.read(key: _accessTokenKey);

  Future<void> saveAccessToken(String token) =>
      _storage.write(key: _accessTokenKey, value: token);

  Future<void> clear() => _storage.delete(key: _accessTokenKey);
}

/// Adds `Authorization: Bearer <token>` when a token is stored.
/// Extend `onError` here for a refresh-once-and-retry flow.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._tokens);

  final TokenStore _tokens;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    String? token;
    try {
      token = await _tokens.readAccessToken();
    } on Exception {
      token = null;
    }
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(const FlutterSecureStorage()),
);

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBase,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      headers: <String, dynamic>{'Accept': 'application/json'},
    ),
  );
  dio.interceptors.add(AuthInterceptor(ref.watch(tokenStoreProvider)));
  ref.onDispose(dio.close);
  return dio;
});
