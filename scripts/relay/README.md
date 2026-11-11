# Relay worker scripts

Sandbox copies of the relay pool clients used by the human reply workers.
These are the canonical copies: if a worker sandbox is wiped, restore from here.

- `worker.mjs` - claim/answer client (claim, answer, answer-v, answer-voice, ask, doclink, skip).
- `relay.mjs` - management helpers (status, pending, reply, replyaudio, emaildrafts, emailsend, brief, doclink).

Both read the relay HMAC secret from the sandbox vault file
`/home/sandbox/.vault/whatsapp-app-secret-udc-staging-render-38d955/password`
(vault item "WHATSAPP_APP_SECRET (UDC staging Render)"). Restore it with
`tools vault write-file --key password --name "WHATSAPP_APP_SECRET (UDC staging Render)" --return-channel none`.
Never commit the secret itself.
