<script lang="ts">
  import { locale } from '$lib/stores/preferences.store';
  import type { DiskHealthHistoryResponseDto, DiskHealthResponseDto } from '@immich/sdk';
  import {
    Code,
    FormatBytes,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeading,
    TableRow,
    Text,
  } from '@immich/ui';
  import { t } from 'svelte-i18n';

  type Props = {
    diskHealthPromise: Promise<DiskHealthResponseDto>;
    diskHistoryPromise: Promise<DiskHealthHistoryResponseDto>;
  };

  const { diskHealthPromise, diskHistoryPromise }: Props = $props();

  const statusClass: Record<string, string> = {
    healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    degraded: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };

  const getStatusLabel = (status: DiskHealthResponseDto['devices'][number]['status']) => {
    switch (status) {
      case 'healthy':
        return $t('admin.disk_health_status_healthy');
      case 'warning':
        return $t('warning');
      case 'critical':
        return $t('admin.disk_health_status_critical');
      case 'degraded':
        return $t('admin.disk_health_status_degraded');
      case 'unknown':
        return $t('unknown');
    }
  };

  const buildSparkline = (values: Array<number | null>) => {
    const filtered = values.filter((value): value is number => value !== null);
    if (filtered.length < 2) {
      return '';
    }

    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const range = Math.max(max - min, 1);
    const points = values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = value === null ? 100 : 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');

    return points;
  };
</script>

<div class="mt-8 flex flex-col gap-5">
  <div>
    <Text class="mb-2" fontWeight="medium">{$t('admin.disk_health_monitoring')}</Text>
    {#await diskHealthPromise}
      <div class="grid gap-4 md:grid-cols-4">
        {#each Array(4) as _}
          <div class="h-28 rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray"></div>
        {/each}
      </div>
    {:then health}
      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray">
          <div class="text-sm text-gray-500">{$t('admin.disk_health_monitored_disks')}</div>
          <div class="mt-2 font-mono text-3xl text-primary">{health.summary.total}</div>
        </div>
        <div class="rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray">
          <div class="text-sm text-gray-500">{$t('admin.disk_health_status_healthy')}</div>
          <div class="mt-2 font-mono text-3xl text-primary">{health.summary.healthy}</div>
        </div>
        <div class="rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray">
          <div class="text-sm text-gray-500">{$t('warning')}</div>
          <div class="mt-2 font-mono text-3xl text-primary">{health.summary.warning}</div>
        </div>
        <div class="rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray">
          <div class="text-sm text-gray-500">{$t('admin.disk_health_status_critical_unknown')}</div>
          <div class="mt-2 font-mono text-3xl text-primary">{health.summary.critical + health.summary.unknown}</div>
        </div>
      </div>
    {/await}
  </div>

  <div>
    <Text class="mb-2" fontWeight="medium">{$t('admin.disk_health_disk_details')}</Text>
    {#await Promise.all([diskHealthPromise, diskHistoryPromise])}
      <div class="h-40 rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray"></div>
    {:then [health, history]}
      <Table striped size="small">
        <TableHeader>
          <TableHeading>{$t('admin.disk_health_disk')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_status')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_temperature')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_capacity')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_health')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_trend')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_issues')}</TableHeading>
        </TableHeader>
        <TableBody>
          {#each health.devices as device (device.devicePath)}
            {@const historyItem = history.items.find((item) => item.devicePath === device.devicePath)}
            {@const trend = buildSparkline(historyItem?.points.map((point) => point.temperatureCelsius) ?? [])}
            <TableRow>
              <TableCell>
                <div class="flex flex-col">
                  <span class="font-medium"
                    >{device.isPrimary ? $t('admin.disk_health_primary_disk') : device.name}</span
                  >
                  <Code>{device.devicePath}</Code>
                  {#if device.mountPath}
                    <span class="text-xs text-gray-500">{device.mountPath}</span>
                  {/if}
                </div>
              </TableCell>
              <TableCell>
                <span class={`rounded-full px-2 py-1 text-xs font-medium ${statusClass[device.status]}`}>
                  {getStatusLabel(device.status)}
                </span>
              </TableCell>
              <TableCell
                >{device.temperatureCelsius === null
                  ? $t('not_available')
                  : `${device.temperatureCelsius} °C`}</TableCell
              >
              <TableCell>
                {#if device.totalBytes !== null}
                  <FormatBytes bytes={device.usedBytes ?? 0} precision={0} /> / <FormatBytes
                    bytes={device.totalBytes}
                    precision={0}
                  />
                {:else}
                  {$t('not_available')}
                {/if}
              </TableCell>
              <TableCell>
                {#if device.healthPercent !== null}
                  {device.healthPercent.toLocaleString($locale)}%
                {:else}
                  {$t('not_available')}
                {/if}
              </TableCell>
              <TableCell>
                {#if trend}
                  <svg viewBox="0 0 100 100" class="h-10 w-24 overflow-visible">
                    <polyline fill="none" stroke="currentColor" stroke-width="4" points={trend}></polyline>
                  </svg>
                {:else}
                  <span class="text-xs text-gray-500">{$t('admin.disk_health_not_enough_history')}</span>
                {/if}
              </TableCell>
              <TableCell>
                {#if device.issues.length > 0}
                  <div class="max-w-80 text-xs text-gray-600 dark:text-gray-300">
                    {device.issues.join(', ')}
                  </div>
                {:else}
                  <span class="text-xs text-gray-500">{$t('none')}</span>
                {/if}
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    {/await}
  </div>
</div>
