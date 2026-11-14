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

## Mark an already-covered item done without sending

Both clients support the same command:

```sh
node worker.mjs dismiss <workerId> <phone> <itemId> <<'EOF'
Already covered by the delivered reply at <timestamp>.
EOF
```

`relay.mjs dismiss` has identical arguments. The item must be currently claimed
by that worker. A stale claim returns 409 and exits nonzero. Re-read the queue,
never fall back to a phone-wide dismiss. The reason is required (1-200 characters).
Use only for an item confirmed already covered, or otherwise authorized for dismissal.
`skip <phone>` still releases a claim so another worker can answer it; it does not
mark an item complete. Dismiss sends no customer message.

Offline tests: `node --test scripts/relay/client.test.mjs`.
