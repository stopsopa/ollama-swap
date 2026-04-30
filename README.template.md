# installation

```

curl -fsSL https://stopsopa.github.io/ollama-swap/proxy.ts -o proxy.ts
if echo "shahash" | sha256sum -c -; then
  echo "CHECKSUM VALID"
else
  echo "ERROR: INVLID CHECKSUM";
  rm -f proxy.ts
fi

```

Then run proxy pointing to ollama server:


<!-- Environment Variables:
  PORT          Port this proxy server runs on (default: 11444)
  HOST          Host this proxy server binds to (default: 0.0.0.0)
  PROXY_PORT    Port of the target Ollama server (default: 11434)
  PROXY_HOST    Host of the target Ollama server (default: localhost)
  PROXY_SCHEMA  Schema for target Ollama server (http or https, default: http)
  OLLAMA_BIN    Path to the ollama CLI tool (default: ollama)
  DEBUG         Set to 1 to enable debug logging -->

```

PORT=11444 \
HOST="0.0.0.0" \
PROXY_PORT=11434 \
PROXY_HOST="192.168.8.49" \
node proxy.ts

```
