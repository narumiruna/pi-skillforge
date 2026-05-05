set shell := ["bash", "-euo", "pipefail", "-c"]

package := `node -e 'const p = JSON.parse(require("fs").readFileSync("package.json", "utf8")); process.stdout.write(p.name)'`
version := `node -e 'const p = JSON.parse(require("fs").readFileSync("package.json", "utf8")); process.stdout.write(p.version)'`

# Show available commands
default:
    @just --list

# Show npm account/registry/package visibility information
doctor:
    @echo "package: {{package}}"
    @echo "version: {{version}}"
    npm whoami
    npm config get registry
    npm access get status {{package}} || true
    npm dist-tag ls {{package}} || true
    npm view {{package}} version || true

# Run formatter, linter, and typecheck
check:
    npm run check

# Format files with Biome
format:
    npm run format

# Install pre-commit hooks
hooks:
    pre-commit install

# Run pre-commit hooks against all files
pre-commit:
    pre-commit run --all-files

# Preview the package that npm would publish
pack:
    npm pack --dry-run

# Verify the published npm package metadata
verify-npm:
    npm access get status {{package}}
    npm dist-tag ls {{package}}
    npm view {{package}} version

# Install the published package through pi
install-npm:
    pi install npm:{{package}}

# Try this working tree as a temporary pi package
try-local:
    pi -e .

# Try the published npm package as a temporary pi package
try-npm:
    pi -e npm:{{package}}

# Publish the current package.json version to npm
publish:
    npm pack --dry-run
    npm publish --access public
    @echo
    @echo "Published {{package}}@{{version}}"
    @echo "Checking dist-tags, which usually updates before npm view/install metadata..."
    npm dist-tag ls {{package}}
    @echo
    @echo "If npm view or pi install still returns 404, wait a few minutes for npm registry metadata to propagate."

# Bump package.json and package-lock.json without creating a git tag
bump part="patch":
    npm version {{part}} --no-git-tag-version

# Commit the current version bump, tag it, and push main + tag
# Run this after `just publish` succeeds.
tag:
    @version="$(node -e 'const p = JSON.parse(require("fs").readFileSync("package.json", "utf8")); process.stdout.write(p.version)')"; \
    git add package.json package-lock.json README.md PLAN.md justfile; \
    git commit -m "chore(release): $${version}"; \
    git tag "v$${version}"; \
    git push origin main; \
    git push origin "v$${version}"

# Full release flow: bump, publish, then commit/tag/push
release part="patch":
    npm version {{part}} --no-git-tag-version
    npm run check
    npm pack --dry-run
    npm publish --access public
    @version="$(node -e 'const p = JSON.parse(require("fs").readFileSync("package.json", "utf8")); process.stdout.write(p.version)')"; \
    git add package.json package-lock.json README.md PLAN.md justfile; \
    git commit -m "chore(release): $${version}"; \
    git tag "v$${version}"; \
    git push origin main; \
    git push origin "v$${version}"
