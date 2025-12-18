// __tests__/integration/api/sheet-api.test.ts
/**
 * @jest-environment node
 */

import {
  TestApiClient,
  TestDatabase,
  createTestDatabase,
  shouldRunIntegrationTests,
  INTEGRATION_SKIP_MESSAGE,
  createTestClient,
  uniqueModelName
} from '../../support';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('Sheet API Integration Tests', () => {
  let client: TestApiClient;
  let db: TestDatabase;
  let testModelId: string;

  beforeAll(async () => {
    client = createTestClient();
    db = await createTestDatabase();

    // Create a test model
    const result = await client.createModel(uniqueModelName('SheetTests'));
    testModelId = result.data.id;
    db.trackModel(testModelId);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('listSheets', () => {
    it('should list sheets including the main sheet', async () => {
      const result = await client.listSheets(testModelId);

      expect(result.success).toBe(true);
      expect(result.data.modelId).toBe(testModelId);
      expect(result.data.sheetCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(result.data.sheets)).toBe(true);

      // Main sheet should exist
      const mainSheet = result.data.sheets.find((s: any) => s.id === 'main');
      expect(mainSheet).toBeDefined();
      expect(mainSheet.name).toBe('Main');
    });
  });

  describe('createSheet', () => {
    it('should create a new sheet', async () => {
      const result = await client.createSheet(testModelId, 'NewSheet');

      expect(result.success).toBe(true);
      expect(result.data.sheet).toBeDefined();
      expect(result.data.sheet.name).toBe('NewSheet');
      expect(result.data.sheet.id).toBeDefined();
      expect(result.data.sheet.blockCount).toBe(0);
      expect(result.data.newVersion).toBeGreaterThan(1);
    });

    it('should create a sheet with auto-generated name', async () => {
      const result = await client.createSheet(testModelId);

      expect(result.success).toBe(true);
      expect(result.data.sheet.name).toBeDefined();
      // Auto-generated names typically contain "Sheet"
      expect(result.data.sheet.name).toMatch(/Sheet/);
    });

    it('should create a sheet inside a subsystem', async () => {
      // First create a subsystem
      const subsystem = await client.addBlock(testModelId, 'main', 'subsystem', {
        name: 'SubsystemForSheet'
      });
      const subsystemBlockId = subsystem.data.block.id;

      // Create a sheet inside the subsystem
      const result = await client.createSheet(testModelId, 'SubSheet', subsystemBlockId);

      expect(result.success).toBe(true);
      expect(result.data.sheet.name).toBe('SubSheet');
      expect(result.data.subsystemBlockId).toBe(subsystemBlockId);
    });
  });

  describe('renameSheet', () => {
    let testSheetId: string;

    beforeAll(async () => {
      const result = await client.createSheet(testModelId, 'ToRename');
      testSheetId = result.data.sheet.id;
    });

    it('should rename a sheet', async () => {
      const result = await client.renameSheet(testModelId, testSheetId, 'RenamedSheet');

      expect(result.success).toBe(true);
      expect(result.data.sheet.name).toBe('RenamedSheet');
      expect(result.data.sheet.id).toBe(testSheetId);

      // Verify persistence
      const listResult = await client.listSheets(testModelId);
      const renamed = listResult.data.sheets.find((s: any) => s.id === testSheetId);
      expect(renamed.name).toBe('RenamedSheet');
    });

    it('should reject rename without newName', async () => {
      const result = await client.put({
        action: 'renameSheet',
        modelId: testModelId,
        sheetId: testSheetId
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMETER');
    });
  });

  describe('cloneSheet', () => {
    let sourceSheetId: string;

    beforeAll(async () => {
      // Create a sheet with some blocks
      const sheetResult = await client.createSheet(testModelId, 'ToClone');
      sourceSheetId = sheetResult.data.sheet.id;

      // Add some blocks
      await client.addBlock(testModelId, sourceSheetId, 'source', { name: 'Const1' });
      await client.addBlock(testModelId, sourceSheetId, 'scale', { name: 'Scale1' });
    });

    it('should clone a sheet with all blocks', async () => {
      const result = await client.cloneSheet(testModelId, sourceSheetId, 'ClonedSheet');

      expect(result.success).toBe(true);
      expect(result.data.sourceSheetId).toBe(sourceSheetId);
      expect(result.data.clonedSheet.name).toBe('ClonedSheet');
      expect(result.data.clonedSheet.blockCount).toBe(2);
      expect(result.data.blockMapping).toBeDefined();
    });

    it('should auto-generate clone name if not provided', async () => {
      const result = await client.cloneSheet(testModelId, sourceSheetId);

      expect(result.success).toBe(true);
      expect(result.data.clonedSheet.name).toContain('Copy');
    });
  });

  describe('exportSheet', () => {
    let exportSheetId: string;

    beforeAll(async () => {
      const sheetResult = await client.createSheet(testModelId, 'ToExport');
      exportSheetId = sheetResult.data.sheet.id;

      await client.addBlock(testModelId, exportSheetId, 'source', { name: 'ExportConst' });
    });

    it('should export sheet as standalone JSON', async () => {
      const result = await client.exportSheet(testModelId, exportSheetId);

      expect(result.success).toBe(true);
      expect(result.data.exportData).toBeDefined();
      expect(result.data.exportData.exportMetadata).toBeDefined();
      expect(result.data.exportData.exportMetadata.sourceModelId).toBe(testModelId);
      expect(result.data.exportData.sheet).toBeDefined();
      expect(result.data.exportData.sheet.id).toBe(exportSheetId);
      expect(result.data.exportData.sheet.blocks).toBeDefined();
      expect(result.data.statistics.blockCount).toBe(1);
    });
  });

  describe('importSheet', () => {
    it('should import a sheet from exported data', async () => {
      // First export a sheet
      const sheetToExport = await client.createSheet(testModelId, 'ExportForImport');
      await client.addBlock(testModelId, sheetToExport.data.sheet.id, 'source', { name: 'ImportConst' });
      const exportResult = await client.exportSheet(testModelId, sheetToExport.data.sheet.id);

      // Import it with a new name
      const importResult = await client.importSheet(
        testModelId,
        exportResult.data.exportData.sheet,
        'ImportedSheet'
      );

      expect(importResult.success).toBe(true);
      expect(importResult.data.importedSheet.name).toBe('ImportedSheet');
      expect(importResult.data.importedSheet.blockCount).toBe(1);
      expect(importResult.data.idMappings).toBeDefined();
      expect(importResult.data.idMappings.blocks).toBeDefined();
    });
  });

  describe('clearSheet', () => {
    let clearSheetId: string;

    beforeAll(async () => {
      const sheetResult = await client.createSheet(testModelId, 'ToClear');
      clearSheetId = sheetResult.data.sheet.id;

      // Add blocks and connections
      const const1 = await client.addBlock(testModelId, clearSheetId, 'source', { name: 'ClearC1' });
      const scale1 = await client.addBlock(testModelId, clearSheetId, 'scale', { name: 'ClearS1' });
      await client.addConnection(testModelId, clearSheetId, const1.data.block.id, scale1.data.block.id, {
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
    });

    it('should clear all blocks and connections from a sheet', async () => {
      const result = await client.clearSheet(testModelId, clearSheetId);

      expect(result.success).toBe(true);
      expect(result.data.removedBlockCount).toBe(2);
      expect(result.data.removedConnectionCount).toBe(1);

      // Verify the sheet is empty
      const blocks = await client.listBlocks(testModelId, clearSheetId);
      expect(blocks.data.blockCount).toBe(0);
    });
  });

  describe('deleteSheet', () => {
    it('should delete a sheet', async () => {
      const sheetResult = await client.createSheet(testModelId, 'ToDelete');
      const sheetId = sheetResult.data.sheet.id;

      const deleteResult = await client.deleteSheet(testModelId, sheetId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data.deletedSheet.id).toBe(sheetId);

      // Verify it's gone
      const listResult = await client.listSheets(testModelId);
      const found = listResult.data.sheets.find((s: any) => s.id === sheetId);
      expect(found).toBeUndefined();
    });

    it('should reject deletion of main sheet', async () => {
      const result = await client.deleteSheet(testModelId, 'main');

      expect(result.success).toBe(false);
      expect(result.code).toBe('MAIN_SHEET_ERROR');
    });

    it('should reject deletion of last sheet', async () => {
      // Create a model with only one sheet
      const model = await client.createModel(uniqueModelName('SingleSheet'));
      db.trackModel(model.data.id);

      const result = await client.deleteSheet(model.data.id, 'main');

      expect(result.success).toBe(false);
      // Could be MAIN_SHEET_ERROR or LAST_SHEET_ERROR
      expect(['MAIN_SHEET_ERROR', 'LAST_SHEET_ERROR']).toContain(result.code);
    });
  });
});

if (!shouldRunIntegrationTests()) {
  console.log(INTEGRATION_SKIP_MESSAGE);
}
