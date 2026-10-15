<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  active: Boolean,
  disabled: Boolean,
  variant: { type: String, default: "" },
  size: { type: String, default: "" },
  withLabel: Boolean,
});
const emit = defineEmits(["click"]);
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="[variant && `icon-button--${variant}`, size && `icon-button--${size}`, { active }]"
    :aria-label="label"
    :aria-pressed="active ? 'true' : undefined"
    :title="label"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <AppIcon :name="icon" />
    <span v-if="withLabel" class="icon-button-text"><slot>{{ label }}</slot></span>
    <span v-else-if="$slots.default" class="icon-button-badge"><slot /></span>
  </button>
</template>
