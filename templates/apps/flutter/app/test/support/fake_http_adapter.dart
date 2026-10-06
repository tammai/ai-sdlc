import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// In-memory Dio adapter: records requests and answers with canned JSON.
/// No sockets are opened.
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.respond);

  final ResponseBody Function(RequestOptions options) respond;
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonResponse(
  Object body,
  int statusCode, {
  String contentType = 'application/json',
}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: <String, List<String>>{
      Headers.contentTypeHeader: <String>[contentType],
    },
  );
}

Dio fakeDio(FakeHttpAdapter adapter) {
  return Dio(BaseOptions(baseUrl: 'http://api.test'))
    ..httpClientAdapter = adapter;
}
