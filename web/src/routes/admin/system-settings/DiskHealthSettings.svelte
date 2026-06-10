<script lang="ts">
  import SettingButtonsRow from '$lib/components/shared-components/settings/SystemConfigButtonRow.svelte';
  import SettingInputField from '$lib/components/shared-components/settings/SettingInputField.svelte';
  import SettingSwitch from '$lib/components/shared-components/settings/SettingSwitch.svelte';
  import { SettingInputFieldType } from '$lib/constants';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { systemConfigManager } from '$lib/managers/system-config-manager.svelte';
  import { getDiskHealth, type DiskHealthResponseDto } from '@immich/sdk';
  import { Button, Icon, IconButton, Text, toastManager } from '@immich/ui';
  import { mdiHarddisk, mdiInformationOutline, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fade } from 'svelte/transition';

  const disabled = $derived(featureFlagsManager.value.configFile);
  const config = $derived(systemConfigManager.value);
  let configToEdit = $state(systemConfigManager.cloneValue());
  let primaryDisk = $state<DiskHealthResponseDto['devices'][number] | null>(null);

  for (const device of configToEdit.diskMonitoring.devices) {
    device.mountPath ??= '';
    device.notes ??= '';
  }

  onMount(async () => {
    try {
      const response = await getDiskHealth();
      primaryDisk = response.devices.find((device) => device.isPrimary) ?? null;
    } catch {
      primaryDisk = null;
    }
  });

  const addDevice = () => {
    configToEdit.diskMonitoring.devices.push({
      name: '',
      devicePath: '',
      mountPath: null,
      notes: null,
    });
  };

  const validate = async () => {
    const seen = new Set<string>();
    for (const device of configToEdit.diskMonitoring.devices) {
      device.mountPath = device.mountPath?.trim() ? device.mountPath : null;
      device.notes = device.notes?.trim() ? device.notes : null;

      if (!device.name.trim() || !device.devicePath.trim()) {
        toastManager.danger($t('admin.disk_health_validation_missing_fields'));
        return false;
      }

      if (seen.has(device.devicePath)) {
        toastManager.danger($t('admin.disk_health_validation_duplicate_device_paths'));
        return false;
      }

      seen.add(device.devicePath);
    }

    return true;
  };
</script>

<div>
  <div in:fade={{ duration: 500 }}>
    <form autocomplete="off" onsubmit={(event) => event.preventDefault()}>
      <div class="ms-4 mt-4 flex flex-col gap-4">
        <SettingSwitch
          title={$t('admin.disk_health_enable')}
          subtitle={$t('admin.disk_health_enable_description')}
          {disabled}
          bind:checked={configToEdit.diskMonitoring.enabled}
        />

        <SettingInputField
          inputType={SettingInputFieldType.NUMBER}
          label={$t('admin.disk_health_check_interval')}
          description={$t('admin.disk_health_check_interval_description')}
          min={5}
          max={1440}
          required={true}
          bind:value={configToEdit.diskMonitoring.checkIntervalMinutes}
          disabled={disabled || !configToEdit.diskMonitoring.enabled}
          isEdited={configToEdit.diskMonitoring.checkIntervalMinutes !== config.diskMonitoring.checkIntervalMinutes}
        />

        <SettingInputField
          inputType={SettingInputFieldType.NUMBER}
          label={$t('admin.disk_health_retention')}
          description={$t('admin.disk_health_retention_description')}
          min={1}
          max={365}
          required={true}
          bind:value={configToEdit.diskMonitoring.retentionDays}
          disabled={disabled || !configToEdit.diskMonitoring.enabled}
          isEdited={configToEdit.diskMonitoring.retentionDays !== config.diskMonitoring.retentionDays}
        />

        <div class="rounded-2xl border-2 border-primary/20 p-4">
          <div class="flex items-center gap-2 text-primary">
            <Icon icon={mdiHarddisk} size="18" />
            <Text fontWeight="medium">{$t('admin.disk_health_primary_disk')}</Text>
          </div>
          {#if primaryDisk}
            <div class="mt-3 flex flex-col gap-1 text-sm">
              <div class="font-mono text-gray-700 dark:text-gray-300">{primaryDisk.devicePath}</div>
              {#if primaryDisk.mountPath}
                <div class="text-xs text-gray-500 dark:text-gray-400">{primaryDisk.mountPath}</div>
              {/if}
            </div>
          {:else}
            <div class="mt-2 flex items-start gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <Icon icon={mdiInformationOutline} size="15" class="mt-0.5 shrink-0" />
              <span>{$t('admin.disk_health_primary_disk_description')}</span>
            </div>
          {/if}
        </div>

        <div class="rounded-2xl border-2 border-primary/20 p-4">
          <div class="mb-3 flex items-center justify-between">
            <Text fontWeight="medium">{$t('admin.disk_health_additional_disks')}</Text>
            <Button
              size="small"
              shape="round"
              leadingIcon={mdiPlus}
              onclick={addDevice}
              disabled={disabled || !configToEdit.diskMonitoring.enabled}
            >
              {$t('admin.disk_health_add_disk')}
            </Button>
          </div>

          <div class="flex flex-col gap-4">
            {#each configToEdit.diskMonitoring.devices as _, i (i)}
              <div class="rounded-2xl border-2 border-primary/20 p-4">
                <div class="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                  <SettingInputField
                    inputType={SettingInputFieldType.TEXT}
                    label={$t('admin.disk_health_display_name')}
                    bind:value={configToEdit.diskMonitoring.devices[i].name}
                    disabled={disabled || !configToEdit.diskMonitoring.enabled}
                  />

                  <SettingInputField
                    inputType={SettingInputFieldType.TEXT}
                    label={$t('admin.disk_health_device_path')}
                    bind:value={configToEdit.diskMonitoring.devices[i].devicePath}
                    disabled={disabled || !configToEdit.diskMonitoring.enabled}
                  />

                  <div class="flex self-end justify-end pb-4">
                    <IconButton
                      aria-label={$t('admin.disk_health_remove_disk')}
                      onclick={() => configToEdit.diskMonitoring.devices.splice(i, 1)}
                      icon={mdiTrashCanOutline}
                      color="danger"
                      disabled={disabled || !configToEdit.diskMonitoring.enabled}
                    />
                  </div>
                </div>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <SettingInputField
                    inputType={SettingInputFieldType.TEXT}
                    label={$t('admin.disk_health_mount_path')}
                    description={$t('admin.disk_health_mount_path_description')}
                    bind:value={configToEdit.diskMonitoring.devices[i].mountPath}
                    disabled={disabled || !configToEdit.diskMonitoring.enabled}
                  />

                  <SettingInputField
                    inputType={SettingInputFieldType.TEXT}
                    label={$t('notes')}
                    description={$t('admin.disk_health_notes_description')}
                    bind:value={configToEdit.diskMonitoring.devices[i].notes}
                    disabled={disabled || !configToEdit.diskMonitoring.enabled}
                  />
                </div>
              </div>
            {/each}
          </div>
        </div>

        <SettingButtonsRow bind:configToEdit keys={['diskMonitoring']} {disabled} onBeforeSave={validate} />
      </div>
    </form>
  </div>
</div>
