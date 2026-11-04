#!/usr/bin/env bash
# Rewrite every commit on the given branches so that an author/committer email is replaced:
# authors keep their name and get NEW_AUTHOR_EMAIL; committers become Claude <noreply@anthropic.com>.
# The old address also disappears from file contents. Old refs are kept under refs/backup/pre-email-rewrite/.
# Usage: OLD_EMAIL=<address> NEW_AUTHOR_EMAIL=<id+login@users.noreply.github.com> scripts/maintenance/rewrite-author-email.sh <branch>...
# Then verify and force-push each branch with --force-with-lease=<branch>:<backup sha>.
set -euo pipefail
: "${OLD_EMAIL:?set OLD_EMAIL}"; : "${NEW_AUTHOR_EMAIL:?set NEW_AUTHOR_EMAIL}"
[ "$#" -gt 0 ] || { echo "name the branches to rewrite" >&2; exit 1; }
export OLD_EMAIL NEW_AUTHOR_EMAIL FILTER_BRANCH_SQUELCH_WARNING=1
for r in "$@"; do git update-ref "refs/backup/pre-email-rewrite/$r" "$r"; done
git filter-branch -f \
  --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "$OLD_EMAIL" ]; then export GIT_AUTHOR_EMAIL="$NEW_AUTHOR_EMAIL"; fi
if [ "$GIT_COMMITTER_EMAIL" = "$OLD_EMAIL" ]; then export GIT_COMMITTER_NAME="Claude"; export GIT_COMMITTER_EMAIL="noreply@anthropic.com"; fi
' \
  --tree-filter '
grep -rlF --exclude-dir=.git "$OLD_EMAIL" . 2>/dev/null | while read -r f; do
  python3 -I -c "import sys,os;p=sys.argv[1];o=os.environ[\"OLD_EMAIL\"];s=open(p,encoding=\"utf-8\",errors=\"surrogateescape\").read();open(p,\"w\",encoding=\"utf-8\",errors=\"surrogateescape\").write(s.replace(o,\"noreply@anthropic.com\"))" "$f"
done
' \
  -- "$@"
git for-each-ref --format='%(refname)' refs/original | xargs -r -n1 git update-ref -d
for r in "$@"; do
  n=$(git log --format='%ae %ce' "$r" | grep -cF "$OLD_EMAIL" || true)
  echo "$r: commits still carrying the address = $n; $(git rev-list --count "refs/backup/pre-email-rewrite/$r") -> $(git rev-list --count "$r") commits"
done
