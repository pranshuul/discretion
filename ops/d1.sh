#!/usr/bin/env bash
# Operational steps for Discretion phase 1. Idempotent; --dry-run prints and changes nothing.
#
#   ops/d1.sh [--dry-run] [--vault DIR]
#
# Step 2: create the vault (default ~/vault) as a git repository with 1-Roots, 2-Orchard,
# 3-Mycelium (with its subfolders), 4-Nursery, a .gitignore and a .gitattributes.
set -eu

dry=0
vault="${HOME:-}/vault"
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) dry=1 ;;
    --vault)
      [ $# -ge 2 ] || { echo "--vault needs a directory" >&2; exit 2; }
      vault=$2
      shift
      ;;
    *) echo "usage: ops/d1.sh [--dry-run] [--vault DIR]" >&2; exit 2 ;;
  esac
  shift
done

folders="1-Roots 2-Orchard
3-Mycelium/canon 3-Mycelium/inbox 3-Mycelium/goals 3-Mycelium/tasks 3-Mycelium/plans
3-Mycelium/review/items 3-Mycelium/reels 3-Mycelium/days 3-Mycelium/ribbons 3-Mycelium/config
4-Nursery/cards 4-Nursery/concepts"

changed=0
act() { # act <description> <command...>
  local description=$1
  shift
  changed=1
  if [ "$dry" = 1 ]; then echo "would: $description"; else echo "$description"; "$@"; fi
}

ensure_line() { # ensure_line <file> <line>
  if [ ! -f "$1" ] || ! grep -qxF -- "$2" "$1"; then
    act "add '$2' to $1" append_line "$1" "$2"
  fi
}
append_line() {
  if [ -s "$1" ] && [ -n "$(tail -c1 "$1")" ]; then echo >>"$1"; fi
  printf '%s\n' "$2" >>"$1"
}

if [ ! -d "$vault/.git" ]; then
  act "git init $vault" git init -q "$vault"
fi
for folder in $folders; do
  if [ ! -d "$vault/$folder" ]; then
    act "mkdir $vault/$folder" mkdir -p "$vault/$folder"
  fi
done
ensure_line "$vault/.gitignore" ".obsidian/workspace*.json"
ensure_line "$vault/.gitignore" ".trash/"
ensure_line "$vault/.gitattributes" "1-Roots/** filter=git-crypt diff=git-crypt"

[ "$changed" = 1 ] || echo "nothing to do"
