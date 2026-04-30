

# native ollama deamon

```

launchctl list | grep ollama

launchctl print gui/$(id -u)/com.ollama.ollama


 * start:
 * launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yourname.ollama-swap.plist
 * 
 * inspect:
 * ps aux | grep proxy.ts
 * 
 * launchctl print gui/$(id -u)/com.ollama.ollama
 * launchctl print gui/$(id -u)/com.ollama.ollama | grep state
 * log show --predicate 'process == "ollama"' --last 10m
 * 
 * stop:
 * launchctl bootout gui/$(id -u)/com.ollama.ollama

```