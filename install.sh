#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_HOME="${HOME}/.claude/skills"
TARGET="${SKILLS_HOME}/loupe"

mkdir -p "${SKILLS_HOME}"

if [ -L "${TARGET}" ]; then
  current="$(readlink "${TARGET}")"
  if [ "${current}" = "${SKILL_DIR}" ]; then
    echo "Already installed: ${TARGET} -> ${SKILL_DIR}"
    exit 0
  fi
  echo "Updating symlink: ${TARGET} -> ${SKILL_DIR} (was ${current})"
  ln -sf "${SKILL_DIR}" "${TARGET}"
elif [ -e "${TARGET}" ]; then
  echo "Error: ${TARGET} exists and is not a symlink. Remove it manually and re-run." >&2
  exit 1
else
  ln -s "${SKILL_DIR}" "${TARGET}"
  echo "Installed: ${TARGET} -> ${SKILL_DIR}"
fi
