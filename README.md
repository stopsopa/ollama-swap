# Purpose

This is a small proxy server that sits in front of a locally installed Ollama instance on a Mac (e.g. Mac mini).

Its main purpose is to ensure that only one Ollama model is running at any given time. On the first request for a model, the proxy allows Ollama to load it and keep it alive using its native keep-alive behavior. If a request for a different model arrives while another model is active, the proxy waits until the current request fully completes and its response is returned, then it stops the previous model and switches to the new one.

All switching is strictly serialized. While a response is being generated from the current model, any requests targeting a different model are placed in a queue and are only processed after the current response has been fully served and the model transition is safe.

The main purpose of this proxy is to prevent more than one model from running at the same time on a Mac mini that is configured to run single models at full resource utilization. Running multiple models would lead to SSD swapping and degraded performance, so strict single-model execution is enforced.

The proxy also provides visibility into all traffic. It forwards every request and response to a UI for inspection. Nothing is persisted to disk; the UI is purely for live observation.

In addition, while Ollama runs locally on macOS via its native ollama serve process, it is not bound to 0.0.0.0, which makes it inaccessible over the local network. This proxy is bound to 0.0.0.0 and forwards traffic to the local Ollama instance, effectively exposing it over LAN while keeping control over execution and model switching.

In summary, it enforces single-model execution, queues and serializes model switching, provides live request/response inspection via UI, and exposes the local Ollama server to the network through controlled forwarding.
# Demo

![docs/video.jpg](https://youtu.be/wvez632CkjY)

# Installation

Visit https://stopsopa.github.io/ollama-swap/

