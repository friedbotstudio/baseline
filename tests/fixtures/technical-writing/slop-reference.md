## Overview

The system is a guard layer. It sits between the model and the tools. Every call passes through it.

## Architecture

Guards are Node scripts. They run as subprocesses. Their exit code decides the outcome.

The roster is derived from disk. It is not hand-maintained. This keeps it accurate.

## Outcomes

A guard blocks a call. A guard allows a call. A guard asks the user.

Blocking is the default for writes. Allowing is the default for reads. Asking is reserved for risky operations.

## Configuration

Configuration lives in a settings file. The file is JSON. It declares the wiring.

Each entry names an event. Each entry names a script. The runtime resolves both.

## Amendment

Changes require approval. Approval is explicit. The record is the genesis document.

The count is fixed. The audit checks it. A mismatch fails the build.
