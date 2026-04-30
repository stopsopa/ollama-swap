# Purpose

This is small proxy server which once ran on the mac with ollama installed will always keep one ollama model running. 
Basically what it will do is it will allow ollama server to run model on first request and keep it running with its natural keep alive parameter. But the moment request will come to this machine to query different model it will stop the previous one.
All done only after previous response will be served in concurrent manner.
Until last response will be served from previous model all consecutive requests to new model will be held in queue.

The main purpose for this proxy is to never allow more than one model to run on my mac mini which can run single model but not more than one at a time.

Also this proxy server allow me to monitor every request to ollama.
Server also provides UI to see all what was sent to ollama and all what was returned.

# Installation

Visit https://stopsopa.github.io/ollama-swap/

