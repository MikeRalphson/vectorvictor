#!/bin/sh
#
# monkeypatch.sh - patches feathersjs to make CORS work properly

cp monkey/http.js node_modules/@feathersjs/transport-commons/lib/
cp monkey/rest.js node_modules/@feathersjs/koa/lib/
