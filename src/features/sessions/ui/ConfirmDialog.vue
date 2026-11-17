<script setup lang="ts">
import { AlertTriangle, X } from "lucide-vue-next";
import type { ConfirmRequest } from "../model/sessions";
defineProps<{ request: ConfirmRequest }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>
<template>
  <div class="modal-backdrop" role="presentation" @click.self="emit('cancel')">
    <div class="confirm-dialog" role="alertdialog" aria-modal="true">
      <button class="confirm-close" aria-label="关闭" @click="emit('cancel')">
        <X :size="15" />
      </button>
      <div class="confirm-icon"><AlertTriangle :size="22" /></div>
      <h3>{{ request.title }}</h3>
      <p>{{ request.message }}</p>
      <ul v-if="request.details.length" class="confirm-details">
        <li v-for="(line, i) in request.details" :key="i">{{ line }}</li>
      </ul>
      <div class="confirm-actions">
        <button class="confirm-cancel" @click="emit('cancel')">再想想</button>
        <button class="confirm-danger" @click="emit('confirm')">
          确认删除
        </button>
      </div>
    </div>
  </div>
</template>
