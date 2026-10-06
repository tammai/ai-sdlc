import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:__APP_SNAKE__/core/api_client.dart';

import '../support/fake_http_adapter.dart';

class MockTokenStore extends Mock implements TokenStore {}

void main() {
  late MockTokenStore tokens;
  late FakeHttpAdapter adapter;

  setUp(() {
    tokens = MockTokenStore();
    adapter = FakeHttpAdapter((_) => jsonResponse(<String, dynamic>{}, 200));
  });

  test('AuthInterceptor sends the stored bearer token', () async {
    when(() => tokens.readAccessToken()).thenAnswer((_) async => 'abc');
    final dio = fakeDio(adapter)..interceptors.add(AuthInterceptor(tokens));

    await dio.get<Object>('/healthz');

    expect(adapter.requests.single.headers['Authorization'], 'Bearer abc');
  });

  test('AuthInterceptor sends no Authorization header without a token', () async {
    when(() => tokens.readAccessToken()).thenAnswer((_) async => null);
    final dio = fakeDio(adapter)..interceptors.add(AuthInterceptor(tokens));

    await dio.get<Object>('/healthz');

    expect(
      adapter.requests.single.headers.containsKey('Authorization'),
      isFalse,
    );
  });
}
