// Copyright 2012 The Obvious Corporation.

#include <node.h>
#include <v8.h>

#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

using namespace v8;

#define DEV_NULL "/dev/null"

/**
 * Helper to schedule an exception with the given message and return
 * undefined.
 */
static void scheduleException(const FunctionCallbackInfo<Value>& info, const char* message) {
    Isolate* isolate = info.GetIsolate();
    isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, message)));
    info.GetReturnValue().SetUndefined();
}

void CloseStdin(const FunctionCallbackInfo<Value>& info) {
    freopen(DEV_NULL, "r", stdin);
}

void CloseStdout(const FunctionCallbackInfo<Value>& info) {
    freopen(DEV_NULL, "w", stdout);
}

void CloseStderr(const FunctionCallbackInfo<Value>& info) {
    freopen(DEV_NULL, "w", stderr);
}

void ReopenStdout(const FunctionCallbackInfo<Value>& info) {

    if (!info[0]->IsString()) {
        scheduleException(info, "Not a string.");
        return;
    }

    Local<String> name = info[0]->ToString();
    if (name->Length() < 1) {
        scheduleException(info, "Not a string.");
        return;
    }

    String::Utf8Value data(name);

    if (freopen(*data, "a", stdout) == NULL) {
        scheduleException(info, "Failed to reopen stdout.");
        return;
    }

    info.GetReturnValue().SetUndefined();
}

void ReopenStderr(const FunctionCallbackInfo<Value>& info) {

    if (!info[0]->IsString()) {
        scheduleException(info, "Not a string.");
        return;
    }

    Local<String> name = info[0]->ToString();
    if (name->Length() < 1) {
        scheduleException(info, "Not a string.");
        return;
    }

    String::Utf8Value data(name);

    if (freopen(*data, "a", stderr) == NULL) {
        scheduleException(info, "Failed to reopen stderr.");
        return;
    }

    info.GetReturnValue().SetUndefined();
}

/**
 * This is adapted from the daemon.node module:
 *
 *     https://github.com/indexzero/daemon.node
 *
 * That code is licensed under the MIT License, but also this code isn't
 * just a straight copy anyway.
 */
void AcquireLock(const FunctionCallbackInfo<Value>& info) {

    if (!info[0]->IsString()) {
        scheduleException(info, "Not a string.");
        return;
    }

    Local<String> name = info[0]->ToString();
    if (name->Length() < 1) {
        scheduleException(info, "Not a string.");
        return;
    }

    String::Utf8Value data(name);

    int lockFd = open(*data, O_RDWR | O_CREAT, 0640);
    if (lockFd < 0) {
        scheduleException(info, "Failed to open lock file");
        return;
    }

    if (lockf(lockFd, F_TLOCK, 0) < 0) {
        info.GetReturnValue().Set(false);
        return;
    }

    char *pidStr;
    int pidLen = asprintf(&pidStr, "%d", getpid());

    if (pidLen < 0) {
        // This shouldn't happen, and is probably a sign of
        // catastrophic failure, but we'll attempt to deal.
        scheduleException(info, "Failed make pid string");
        return;
    }

    write(lockFd, pidStr, pidLen);
    free(pidStr);

    ftruncate(lockFd, pidLen);
    fsync(lockFd);

    info.GetReturnValue().Set(true);
}

void initialise(Handle<Object> exports) {
    NODE_SET_METHOD(exports, "closeStdin", CloseStdin);
    NODE_SET_METHOD(exports, "closeStdout", CloseStdout);
    NODE_SET_METHOD(exports, "closeStderr", CloseStderr);
    NODE_SET_METHOD(exports, "reopenStdout", ReopenStdout);
    NODE_SET_METHOD(exports, "reopenStderr", ReopenStderr);
    NODE_SET_METHOD(exports, "acquireLock", AcquireLock);
}

NODE_MODULE(daemonsauceNative, initialise)
