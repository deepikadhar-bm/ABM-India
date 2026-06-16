import * as fs   from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

export class TestDataManager {

    private dataPath: string;
    private cache: Map<string, any> = new Map();

    constructor() {
        this.dataPath = path.join(process.cwd(), 'testdata');
    }

    // =========================================================================
    // PRIVATE HELPER — resolve sheet by name OR index, default = first sheet
    // =========================================================================

    private async resolveSheet(
        workbook:  ExcelJS.Workbook,
        sheet?:    string | number       // name, index, or undefined = first sheet
    ): Promise<ExcelJS.Worksheet> {

        // ── No sheet argument → use first sheet ───────────────────────────────
        if (sheet === undefined || sheet === null) {
            const first = workbook.worksheets[0];
            if (!first) throw new Error(`Workbook has no sheets`);
            return first;
        }

        // ── Number → treat as 0-based index ──────────────────────────────────
        if (typeof sheet === 'number') {
            const ws = workbook.worksheets[sheet];
            if (!ws) throw new Error(
                `Sheet index ${sheet} not found. Available: 0–${workbook.worksheets.length - 1}`
            );
            return ws;
        }

        // ── String → treat as sheet name ──────────────────────────────────────
        const ws = workbook.getWorksheet(sheet);
        if (!ws) throw new Error(
            `Sheet "${sheet}" not found. Available: ${workbook.worksheets.map(s => s.name).join(', ')}`
        );
        return ws;
    }

    // =========================================================================
    // JSON
    // =========================================================================

    loadJSON(filePath: string): any {
        const cacheKey = `json_${filePath}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        const fullPath = path.join(this.dataPath, filePath);
        if (!fs.existsSync(fullPath)) throw new Error(`JSON file not found: ${fullPath}`);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        this.cache.set(cacheKey, data);
        return data;
    }

    // =========================================================================
    // CSV
    // =========================================================================

    loadCSV(filePath: string): string[][] {
        const cacheKey = `csv_${filePath}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        const fullPath = path.join(this.dataPath, filePath);
        if (!fs.existsSync(fullPath)) throw new Error(`CSV file not found: ${fullPath}`);
        const rows = fs.readFileSync(fullPath, 'utf8').split('\n').map(row => row.split(','));
        this.cache.set(cacheKey, rows);
        return rows;
    }

    // =========================================================================
    // EXCEL — load workbook
    // =========================================================================

    async loadExcel(filePath: string): Promise<ExcelJS.Workbook> {
        const cacheKey = `excel_${filePath}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        const fullPath = path.join(this.dataPath, filePath);
        if (!fs.existsSync(fullPath)) throw new Error(`Excel file not found: ${fullPath}`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(fullPath);
        this.cache.set(cacheKey, workbook);
        return workbook;
    }

    // =========================================================================
    // SHEETS
    // =========================================================================

    async getSheetNames(filePath: string): Promise<string[]> {
        const workbook = await this.loadExcel(filePath);
        return workbook.worksheets.map(sheet => sheet.name);
    }

    async getSheetCount(filePath: string): Promise<number> {
        const workbook = await this.loadExcel(filePath);
        return workbook.worksheets.length;
    }

    async sheetExists(filePath: string, sheetName: string): Promise<boolean> {
        const workbook = await this.loadExcel(filePath);
        return !!workbook.getWorksheet(sheetName);
    }

    // =========================================================================
    // ROWS / COLUMNS
    // =========================================================================

    async getRowCount(filePath: string, sheet?: string | number): Promise<number> {
        const workbook = await this.loadExcel(filePath);
        return (await this.resolveSheet(workbook, sheet)).rowCount;
    }

    async getColumnCount(filePath: string, sheet?: string | number): Promise<number> {
        const workbook = await this.loadExcel(filePath);
        return (await this.resolveSheet(workbook, sheet)).columnCount;
    }

    async getRowData(filePath: string, rowNumber: number, sheet?: string | number): Promise<any[]> {
        const workbook = await this.loadExcel(filePath);
        const ws       = await this.resolveSheet(workbook, sheet);
        return (ws.getRow(rowNumber).values as any[]).slice(1);
    }

    async getColumnData(filePath: string, columnNumber: number, sheet?: string | number): Promise<any[]> {
        const workbook = await this.loadExcel(filePath);
        const ws       = await this.resolveSheet(workbook, sheet);
        const data: any[] = [];
        ws.eachRow(row => { data.push(row.getCell(columnNumber).value); });
        return data;
    }

    // =========================================================================
    // CELL
    // =========================================================================

    async getCellValue(filePath: string, row: number, column: number, sheet?: string | number): Promise<any> {
        const workbook = await this.loadExcel(filePath);
        const ws       = await this.resolveSheet(workbook, sheet);
        return ws.getRow(row).getCell(column).value;
    }

    // =========================================================================
    // SHEET DATA
    // =========================================================================

    async getSheetData(filePath: string, sheet?: string | number): Promise<any[][]> {
        const workbook = await this.loadExcel(filePath);
        const ws       = await this.resolveSheet(workbook, sheet);
        const data: any[][] = [];
        ws.eachRow(row => {
            data.push((row.values as any[]).slice(1).map(value => value ?? ''));
        });
        return data;
    }

    async getSheetAsJson(filePath: string, sheet?: string | number): Promise<any[]> {
        const workbook = await this.loadExcel(filePath);
        const ws       = await this.resolveSheet(workbook, sheet);
        const headers  = ws.getRow(1).values as any[];
        const result: any[] = [];
        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const obj: Record<string, any> = {};
            headers.forEach((header, index) => {
                if (!header || index === 0) return;
                obj[String(header)] = row.getCell(index).value;
            });
            result.push(obj);
        });
        return result;
    }

    // =========================================================================
    // GENERIC
    // =========================================================================

    getTestData(dataFile: string, key: string): any {
        return this.loadJSON(dataFile)[key] ?? null;
    }

    getAllTestData(dataFile: string): any {
        return this.loadJSON(dataFile);
    }

    // =========================================================================
    // getTestDataByRow
    // -------------------------------------------------------------------------
    // sheet = name | index | undefined (default = first sheet)
    //
    // await testDataManager.getTestDataByRow('file.xlsx', 2)
    // await testDataManager.getTestDataByRow('file.xlsx', 2, 'LoginTestData')
    // await testDataManager.getTestDataByRow('file.xlsx', 2, 0)
    // =========================================================================

    async getTestDataByRow(
        filePath:  string,
        rowNumber: number,
        sheet?:    string | number
    ): Promise<Record<string, any>> {

        const workbook  = await this.loadExcel(filePath);
        const ws        = await this.resolveSheet(workbook, sheet);
        const headerRow = ws.getRow(1).values as any[];
        const dataRow   = ws.getRow(rowNumber);

        if (!dataRow || dataRow.cellCount === 0) {
            throw new Error(`Row ${rowNumber} not found or empty in sheet "${ws.name}"`);
        }

        const result: Record<string, any> = {};
        headerRow.forEach((header, index) => {
            if (!header || index === 0) return;
            result[String(header)] = dataRow.getCell(index).value ?? '';
        });
        return result;
    }

    // =========================================================================
    // getTestDataByTestCaseId
    // -------------------------------------------------------------------------
    // sheet = name | index | undefined (default = first sheet)
    //
    // await testDataManager.getTestDataByTestCaseId('file.xlsx', 'TC01')
    // await testDataManager.getTestDataByTestCaseId('file.xlsx', 'TC01', 'LoginTestData')
    // await testDataManager.getTestDataByTestCaseId('file.xlsx', 'TC01', 1)
    // await testDataManager.getTestDataByTestCaseId('file.xlsx', 'TC01', 'LoginTestData', 'TC_ID')
    // =========================================================================

    async getTestDataByTestCaseId(
        filePath:    string,
        testCaseId:  string,
        sheet?:      string | number,
        idColumnName = 'TestCaseId'
    ): Promise<Record<string, any>> {

        const workbook      = await this.loadExcel(filePath);
        const ws            = await this.resolveSheet(workbook, sheet);
        const headerRow     = ws.getRow(1).values as any[];
        const idColumnIndex = headerRow.findIndex(
            h => h && String(h).trim() === idColumnName
        );

        if (idColumnIndex === -1) {
            throw new Error(
                `Column "${idColumnName}" not found in sheet "${ws.name}". ` +
                `Available: ${headerRow.filter(Boolean).join(', ')}`
            );
        }

        let matchedRow: Record<string, any> | null = null;

        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const cellValue = String(row.getCell(idColumnIndex).value ?? '').trim();
            if (cellValue === testCaseId) {
                const obj: Record<string, any> = {};
                headerRow.forEach((header, index) => {
                    if (!header || index === 0) return;
                    obj[String(header)] = row.getCell(index).value ?? '';
                });
                matchedRow = obj;
            }
        });

        if (!matchedRow) {
            throw new Error(
                `TestCaseId "${testCaseId}" not found in sheet "${ws.name}" of "${filePath}"`
            );
        }

        return matchedRow;
    }

    // =========================================================================
    // getTestDataByColumnValue
    // -------------------------------------------------------------------------
    // sheet = name | index | undefined (default = first sheet)
    //
    // await testDataManager.getTestDataByColumnValue('file.xlsx', 'Username', 'admin')
    // await testDataManager.getTestDataByColumnValue('file.xlsx', 'Username', 'admin', 'LoginTestData')
    // await testDataManager.getTestDataByColumnValue('file.xlsx', 'Username', 'admin', 2)
    // =========================================================================

    async getTestDataByColumnValue(
        filePath:    string,
        columnName:  string,
        columnValue: string,
        sheet?:      string | number
    ): Promise<Record<string, any>> {

        const workbook  = await this.loadExcel(filePath);
        const ws        = await this.resolveSheet(workbook, sheet);
        const headerRow = ws.getRow(1).values as any[];
        const colIndex  = headerRow.findIndex(h => h && String(h).trim() === columnName);

        if (colIndex === -1) {
            throw new Error(`Column "${columnName}" not found in sheet "${ws.name}"`);
        }

        let matchedRow: Record<string, any> | null = null;

        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const cellValue = String(row.getCell(colIndex).value ?? '').trim();
            if (cellValue === columnValue) {
                const obj: Record<string, any> = {};
                headerRow.forEach((header, index) => {
                    if (!header || index === 0) return;
                    obj[String(header)] = row.getCell(index).value ?? '';
                });
                matchedRow = obj;
            }
        });

        if (!matchedRow) {
            throw new Error(
                `No row found where "${columnName}" = "${columnValue}" in sheet "${ws.name}"`
            );
        }

        return matchedRow;
    }

    // =========================================================================
    // getAllTestDataByTag
    // -------------------------------------------------------------------------
    // sheet = name | index | undefined (default = first sheet)
    //
    // await testDataManager.getAllTestDataByTag('file.xlsx', 'Tag', '@smoke')
    // await testDataManager.getAllTestDataByTag('file.xlsx', 'Tag', '@smoke', 'LoginTestData')
    // await testDataManager.getAllTestDataByTag('file.xlsx', 'Tag', '@smoke', 0)
    // =========================================================================

    async getAllTestDataByTag(
        filePath:   string,
        columnName: string,
        tagValue:   string,
        sheet?:     string | number
    ): Promise<Record<string, any>[]> {

        const workbook  = await this.loadExcel(filePath);
        const ws        = await this.resolveSheet(workbook, sheet);
        const headerRow = ws.getRow(1).values as any[];
        const colIndex  = headerRow.findIndex(h => h && String(h).trim() === columnName);

        if (colIndex === -1) {
            throw new Error(`Column "${columnName}" not found in sheet "${ws.name}"`);
        }

        const results: Record<string, any>[] = [];

        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const cellValue = String(row.getCell(colIndex).value ?? '').trim();
            if (cellValue === tagValue) {
                const obj: Record<string, any> = {};
                headerRow.forEach((header, index) => {
                    if (!header || index === 0) return;
                    obj[String(header)] = row.getCell(index).value ?? '';
                });
                results.push(obj);
            }
        });

        return results;
    }

    // =========================================================================
    // CACHE
    // =========================================================================

    clearCache(): void {
        this.cache.clear();
    }
}

export const testDataManager = new TestDataManager();