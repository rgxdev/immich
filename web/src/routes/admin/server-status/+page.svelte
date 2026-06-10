<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import DiskHealthPanel from './DiskHealthPanel.svelte';
  import ServerStatisticsPanel from './ServerStatisticsPanel.svelte';
  import {
    getDiskHealth,
    getDiskHealthHistory,
    getServerStatistics,
    type DiskHealthHistoryResponseDto,
    type DiskHealthResponseDto,
    type ServerStatsResponseDto,
  } from '@immich/sdk';
  import { Container } from '@immich/ui';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  const { data }: Props = $props();

  let stats = $state<ServerStatsResponseDto | undefined>(undefined);
  let diskHealth = $state<DiskHealthResponseDto | undefined>(undefined);
  let diskHistory = $state<DiskHealthHistoryResponseDto | undefined>(undefined);

  const statsPromise = $derived.by(() => {
    if (stats) {
      return Promise.resolve(stats);
    }
    return data.statsPromise;
  });

  const diskHealthPromise = $derived.by(() => {
    if (diskHealth) {
      return Promise.resolve(diskHealth);
    }

    return data.diskHealthPromise;
  });

  const diskHistoryPromise = $derived.by(() => {
    if (diskHistory) {
      return Promise.resolve(diskHistory);
    }

    return data.diskHistoryPromise;
  });

  const updateStatistics = async () => {
    const [nextStats, nextHealth, nextHistory] = await Promise.all([
      getServerStatistics(),
      getDiskHealth(),
      getDiskHealthHistory(),
    ]);
    stats = nextStats;
    diskHealth = nextHealth;
    diskHistory = nextHistory;
  };

  onMount(() => {
    const interval = setInterval(() => void updateStatistics(), 5000);

    return () => clearInterval(interval);
  });
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <Container size="large" center>
    <ServerStatisticsPanel {statsPromise} users={data.users} />
    <DiskHealthPanel {diskHealthPromise} {diskHistoryPromise} />
  </Container>
</AdminPageLayout>
