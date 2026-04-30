# installation

```sh

curl -fsSL https://stopsopa.github.io/ollama-swap/swap.ts -o swap.ts
if echo "shahash" | sha256sum -c -; then
  echo "CHECKSUM VALID"
else
  echo "ERROR: INVLID CHECKSUM";
  rm -f swap.ts
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

```sh

PORT=11444 \
HOST="0.0.0.0" \
PROXY_PORT=11434 \
PROXY_HOST="192.168.8.49" \
node swap.ts

# see also

node swap.ts --help

```

# Mac deamon

```sh
# enter user home directory
cd ~

# download the script
curl -fsSL https://stopsopa.github.io/ollama-swap/swap.ts -o swap.ts
if echo "shahash" | sha256sum -c -; then
  echo "CHECKSUM VALID"
else
  echo "ERROR: INVLID CHECKSUM";
  rm -f swap.ts
fi

# create log directory
mkdir -p ~/ollama-swap
mkdir -p ~/ollama-swap/logs

# create launch agent directory
mkdir -p ~/Library/LaunchAgents

# create lauch agent plist
cat <<EOF > ~/Library/LaunchAgents/com.stopsopa.ollama-swap.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

<key>Label</key>
<string>com.stopsopa.ollama-swap</string>

<key>ProgramArguments</key>
<array>
    <string>$(asdf which node | tr -d '\n')</string>
    <string>${HOME}/swap.ts</string>
</array>

<key>EnvironmentVariables</key>
<dict>
    <key>PORT</key>
    <string>11444</string>
    <key>OLLAMA_BIN</key>
    <string>$(which ollama | tr -d '\n')</string>
</dict>

<key>RunAtLoad</key>
<true/>

<key>KeepAlive</key>
<true/>

<key>WorkingDirectory</key>
<string>${HOME}</string>

<key>StandardOutPath</key>
<string>${HOME}/ollama-swap/logs/launchd.out.log</string>

<key>StandardErrorPath</key>
<string>${HOME}/ollama-swap/logs/launchd.err.log</string>

</dict>
</plist>
EOF

# inspect
vi ~/Library/LaunchAgents/com.stopsopa.ollama-swap.plist

# start the service
ps aux | grep swap.ts
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stopsopa.ollama-swap.plist
# register it with launchd and run at the same time
# use this to run again after stopping it

# confirm registration
launchctl list | grep com.stopsopa.ollama-swap
launchctl print gui/$(id -u)/com.stopsopa.ollama-swap
launchctl print gui/$(id -u)/com.stopsopa.ollama-swap | grep state

# after extracting pid
log show --predicate 'processID == 9098' --last 10m

# stop:
ps aux | grep swap.ts
launchctl bootout gui/$(id -u)/com.stopsopa.ollama-swap
ps aux | grep swap.ts

# logs
ls -la ~/ollama-swap/logs/
tail -f ~/ollama-swap/logs/launchd.out.log
tail -f ~/ollama-swap/logs/launchd.err.log

```

# inspecing 

```sh

# Check if ollama is running with given model you like (in my case qwen2.5:7b)
curl http://0.0.0.0:11434/api/chat -d '{
    "model": "qwen2.5:7b",
    "messages": [{"role": "user", "content": "Hello!"}]
}'

# then let's see which model stayed running
ollama ps

# observe memorey consumption in Activity Monitor when different model is used

curl http://0.0.0.0:11434/api/chat -d '{
    "model": "qwen2.5-coder:7b",
    "messages": [{"role": "user", "content": "Hello!"}]
}'

# here we can see 2 models are running
ollama ps

# now let's stop all running models
ollama stop qwen2.5:7b
ollama stop qwen2.5-coder:7b

# now let's use our proxy server to run different models
# and observe Activity Monitory
curl http://0.0.0.0:11444/api/chat -d '{
    "model": "qwen2.5:7b",
    "messages": [{"role": "user", "content": "Hello!"}]
}'

ollama ps


curl http://0.0.0.0:11444/api/chat -d '{
    "model": "qwen2.5-coder:7b",
    "messages": [{"role": "user", "content": "Hello!"}]
}'

ollama ps

# also there is UI to inspect traffic (even on another machine via LAN)

```
