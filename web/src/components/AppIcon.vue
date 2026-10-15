<script setup>
import { iconMarkup } from "./icons.js";

defineProps({ name: { type: String, required: true } });
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" v-html="iconMarkup[name] || iconMarkup.music" />
</template>
