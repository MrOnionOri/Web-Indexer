# Video Watcher Agent Notes

Respect GateStack IAM.

This module is a standalone satellite service inside the GateStack workspace. It must not import GateStack backend internals or Confluence business models. It should authenticate by calling GateStack `/auth/me` and authorize with `video_watcher:*` permissions.

Initial architecture:

```text
Video upload
  -> frame sampler
  -> lightweight detector
  -> grouped candidate events
  -> evidence frame extraction
  -> vision verifier interface
  -> decision engine
  -> JSON report
```

The lightweight detector is a filter. The vision verifier is the judge. The decision engine is the policy layer.

MVP uses a mock verifier by default. Do not send frames to external LLM providers unless the user explicitly configures that provider.
