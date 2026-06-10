import { DiskHealthService } from 'src/services/disk-health.service';
import { ServerController } from 'src/controllers/server.controller';
import { ServerService } from 'src/services/server.service';
import { SystemMetadataService } from 'src/services/system-metadata.service';
import { VersionService } from 'src/services/version.service';
import request from 'supertest';
import { ControllerContext, controllerSetup, mockBaseService } from 'test/utils';
import { vi } from 'vitest';

describe(ServerController.name, () => {
  let ctx: ControllerContext;
  const serverService = mockBaseService(ServerService);
  const diskHealthService = {
    getDiskHealth: vi.fn(),
    getDiskHealthHistory: vi.fn(),
    runDiskHealthCheck: vi.fn(),
    resetAllMocks() {
      this.getDiskHealth.mockReset();
      this.getDiskHealthHistory.mockReset();
      this.runDiskHealthCheck.mockReset();
    },
  };
  const systemMetadataService = mockBaseService(SystemMetadataService);
  const versionService = mockBaseService(VersionService);

  beforeAll(async () => {
    ctx = await controllerSetup(ServerController, [
      { provide: ServerService, useValue: serverService },
      { provide: DiskHealthService, useValue: diskHealthService },
      { provide: SystemMetadataService, useValue: systemMetadataService },
      { provide: VersionService, useValue: versionService },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    serverService.resetAllMocks();
    diskHealthService.resetAllMocks();
    versionService.resetAllMocks();
    ctx.reset();
  });

  describe('GET /server/license', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/server/license');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('GET /server/disk-health', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/server/disk-health');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('GET /server/disk-health/history', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/server/disk-health/history');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('POST /server/disk-health/check', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/server/disk-health/check');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });
});
