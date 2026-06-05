#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: npm run release -- <patch|minor|major|x.y.z> [--yes] [--no-push]

Runs pre-release checks, bumps package.json versions, commits, tags, and pushes.

Options:
  --yes       Push without confirmation
  --no-push   Run checks and create the commit/tag locally only

Examples:
  npm run release -- patch
  npm run release -- 1.3.0 --yes
  npm run release -- minor --no-push
EOF
}

BUMP=""
AUTO_YES=false
NO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --yes) AUTO_YES=true ;;
    --no-push) NO_PUSH=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    patch|minor|major|[0-9]*.[0-9]*.[0-9]*)
      if [[ -n "$BUMP" ]]; then
        echo "Error: multiple version arguments provided." >&2
        exit 1
      fi
      BUMP="$arg"
      ;;
    *)
      echo "Error: unknown argument '$arg'." >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BUMP" ]]; then
  echo "Error: version bump is required." >&2
  usage
  exit 1
fi

step() {
  echo ""
  echo "==> $1"
}

require_clean_tree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: working tree has uncommitted changes. Commit or stash them first." >&2
    git status --short
    exit 1
  fi
}

require_on_branch() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" == "HEAD" ]]; then
    echo "Error: detached HEAD is not supported for releases." >&2
    exit 1
  fi
  echo "Current branch: $branch"
}

require_up_to_date() {
  git fetch origin --quiet

  local branch upstream
  branch="$(git rev-parse --abbrev-ref HEAD)"
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"

  if [[ -z "$upstream" ]]; then
    echo "Warning: branch '$branch' has no upstream. Skipping remote sync check."
    return
  fi

  local behind ahead
  behind="$(git rev-list --count HEAD.."$upstream" 2>/dev/null || echo 0)"
  ahead="$(git rev-list --count "$upstream"..HEAD 2>/dev/null || echo 0)"

  if [[ "$behind" -gt 0 ]]; then
    echo "Error: branch is $behind commit(s) behind $upstream. Pull before releasing." >&2
    exit 1
  fi

  if [[ "$ahead" -gt 0 ]]; then
    echo "Note: branch is $ahead commit(s) ahead of $upstream; those commits will be included in the release."
  fi
}

run_checks() {
  step "Installing dependencies"
  npm run install:all

  step "Building client and server"
  npm run build

  step "Running tests"
  npm run test
}

bump_version() {
  local version

  step "Bumping version ($BUMP)"
  npm version "$BUMP" --no-git-tag-version
  version="$(node -p "require('./package.json').version")"

  npm version "$version" --no-git-tag-version --prefix client
  npm version "$version" --no-git-tag-version --prefix server

  echo "Updated versions:"
  echo "  root:   $(node -p "require('./package.json').version")"
  echo "  client: $(node -p "require('./client/package.json').version")"
  echo "  server: $(node -p "require('./server/package.json').version")"
}

create_release_commit_and_tag() {
  local version tag
  version="$(node -p "require('./package.json').version")"
  tag="v$version"

  if git rev-parse "$tag" >/dev/null 2>&1; then
    echo "Error: tag '$tag' already exists." >&2
    exit 1
  fi

  step "Creating release commit and tag $tag"
  git add \
    package.json package-lock.json \
    client/package.json client/package-lock.json \
    server/package.json server/package-lock.json
  git commit -m "Release $tag"
  git tag -a "$tag" -m "Release $tag"

  echo ""
  echo "Release prepared: $tag"
}

push_release() {
  local version tag branch
  version="$(node -p "require('./package.json').version")"
  tag="v$version"
  branch="$(git rev-parse --abbrev-ref HEAD)"

  if [[ "$NO_PUSH" == true ]]; then
    echo ""
    echo "Skipping push (--no-push). When ready:"
    echo "  git push origin $branch"
    echo "  git push origin $tag"
    return
  fi

  if [[ "$AUTO_YES" != true ]]; then
    echo ""
    read -r -p "Push branch '$branch' and tag '$tag' to origin? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo "Push cancelled. Release commit and tag were created locally."
      echo "  git push origin $branch"
      echo "  git push origin $tag"
      exit 0
    fi
  fi

  step "Pushing branch and tag"
  git push origin "$branch"
  git push origin "$tag"

  echo ""
  echo "Release $tag pushed. GitHub Actions will build and publish installers."
}

step "Preflight checks"
require_clean_tree
require_on_branch
require_up_to_date

run_checks
bump_version
create_release_commit_and_tag
push_release
