# Northstar Portfolio — canonical project

This is the **only** working copy of this app. It is a git repo (`git remote -v`
to confirm) and has `wrangler.toml`. Any other `yatırım_takip*` folder on this
machine is stale/abandoned — do not edit or deploy from it.

- Live URL: https://northstar2.suleymannet.workers.dev
- Cloudflare Worker name: `northstar2`
- D1 database: `northstar2` (binding `DB`)
- Deploy: `wrangler deploy` from this directory

## Before every deploy

Diff local files against the live site first — do not trust that the local
working tree matches what's deployed:

```
curl -s https://northstar2.suleymannet.workers.dev/ -o /tmp/live_index.html
curl -s https://northstar2.suleymannet.workers.dev/app.js -o /tmp/live_app.js
curl -s https://northstar2.suleymannet.workers.dev/style.css -o /tmp/live_style.css
diff <(tr -d '\r' < index.html) <(tr -d '\r' < /tmp/live_index.html)
diff <(tr -d '\r' < app.js) <(tr -d '\r' < /tmp/live_app.js)
diff <(tr -d '\r' < style.css) <(tr -d '\r' < /tmp/live_style.css)
```

If these diffs show large unexpected differences before you've made any edits,
STOP — you are probably in the wrong directory or the live site has changes
not yet pulled. Do not deploy until the discrepancy is understood.

`git status` should also be clean (or only contain your intended edits) before
deploying.
