export function shouldCloseQueuePanel(target) {
  return !target?.closest?.(".queue-panel, .queue-toggle");
}
