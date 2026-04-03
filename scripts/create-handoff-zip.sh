#!/usr/bin/env bash
set -euo pipefail

# Creates a clean handoff zip that preserves local file: dependency layout.
# Update DEPENDENT_DIRS if calendar-event-demo gains new sibling dependencies.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_DIR="$(cd "${DEMO_DIR}/.." && pwd)"

DEMO_NAME="calendar-event-demo"
DEPENDENT_DIRS=(
  "calendar-module"
  "event-module"
  "module-picker"
  "notification-modules"
)

STAMP="$(date +%Y%m%d-%H%M%S)"
HANDOFF_ROOT="${BASE_DIR}/handoff-${DEMO_NAME}-${STAMP}"
ZIP_PATH="${BASE_DIR}/handoff-${DEMO_NAME}-${STAMP}.zip"

echo "Preparing handoff folder: ${HANDOFF_ROOT}"
mkdir -p "${HANDOFF_ROOT}"

copy_repo() {
  local src="$1"
  local dest="$2"
  if [[ ! -d "${src}" ]]; then
    echo "Missing directory: ${src}" >&2
    exit 1
  fi

  rsync -a \
    --exclude=".git" \
    --exclude="node_modules" \
    --exclude=".expo" \
    --exclude=".next" \
    --exclude="dist" \
    --exclude="build" \
    --exclude="web-build" \
    --exclude="*.log" \
    "${src}/" "${dest}/"
}

copy_repo "${DEMO_DIR}" "${HANDOFF_ROOT}/${DEMO_NAME}"

for dep in "${DEPENDENT_DIRS[@]}"; do
  copy_repo "${BASE_DIR}/${dep}" "${HANDOFF_ROOT}/${dep}"
done

echo "Creating zip: ${ZIP_PATH}"
(cd "${BASE_DIR}" && zip -r "${ZIP_PATH}" "$(basename "${HANDOFF_ROOT}")" >/dev/null)

echo
echo "Done."
echo "Handoff zip: ${ZIP_PATH}"
echo
echo "Recipient quick start:"
echo "  1) Unzip"
echo "  2) cd ${DEMO_NAME}"
echo "  3) npm install"
echo "  4) npm run web"
