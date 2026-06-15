
import * as fs from 'fs';
import * as path from 'path';

import * as ExcelJS from 'exceljs';

export class TestDataManager {

    private dataPath: string;
    private cache: Map<string, any> = new Map();

    constructor() {
        this.dataPath = path.join(
            process.cwd(),
            'test-data'
        );
    }

    // =========================================================================
    // JSON
    // =========================================================================

    loadJSON(filePath: string): any {

        const cacheKey = `json_${filePath}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const fullPath = path.join(
            this.dataPath,
            filePath
        );

        if (!fs.existsSync(fullPath)) {
            throw new Error(
                `JSON file not found: ${fullPath}`
            );
        }

        const data = JSON.parse(
            fs.readFileSync(fullPath, 'utf8')
        );

        this.cache.set(cacheKey, data);

        return data;
    }

    // =========================================================================
    // CSV
    // =========================================================================

    loadCSV(filePath: string): string[][] {

        const cacheKey = `csv_${filePath}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const fullPath = path.join(
            this.dataPath,
            filePath
        );

        if (!fs.existsSync(fullPath)) {
            throw new Error(
                `CSV file not found: ${fullPath}`
            );
        }

        const rows = fs
            .readFileSync(fullPath, 'utf8')
            .split('\n')
            .map(row => row.split(','));

        this.cache.set(cacheKey, rows);

        return rows;
    }

    // =========================================================================
    // EXCEL
    // =========================================================================

    async loadExcel(
        filePath: string
    ): Promise<ExcelJS.Workbook> {

        const cacheKey = `excel_${filePath}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const fullPath = path.join(
            this.dataPath,
            filePath
        );

        if (!fs.existsSync(fullPath)) {
            throw new Error(
                `Excel file not found: ${fullPath}`
            );
        }

        const workbook =
            new ExcelJS.Workbook();

        await workbook.xlsx.readFile(
            fullPath
        );

        this.cache.set(
            cacheKey,
            workbook
        );

        return workbook;
    }

    // =========================================================================
    // SHEETS
    // =========================================================================

    async getSheetNames(
        filePath: string
    ): Promise<string[]> {

        const workbook =
            await this.loadExcel(filePath);

        return workbook.worksheets.map(
            sheet => sheet.name
        );
    }

    async getSheetCount(
        filePath: string
    ): Promise<number> {

        const workbook =
            await this.loadExcel(filePath);

        return workbook.worksheets.length;
    }

    async sheetExists(
        filePath: string,
        sheetName: string
    ): Promise<boolean> {

        const workbook =
            await this.loadExcel(filePath);

        return !!workbook.getWorksheet(
            sheetName
        );
    }

    // =========================================================================
    // ROWS / COLUMNS
    // =========================================================================

    async getRowCount(
        filePath: string,
        sheetName: string
    ): Promise<number> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        return sheet.rowCount;
    }

    async getColumnCount(
        filePath: string,
        sheetName: string
    ): Promise<number> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        return sheet.columnCount;
    }

    async getRowData(
        filePath: string,
        sheetName: string,
        rowNumber: number
    ): Promise<any[]> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        return (sheet
            .getRow(rowNumber)
            .values as any[])
            .slice(1);
    }

    async getColumnData(
        filePath: string,
        sheetName: string,
        columnNumber: number
    ): Promise<any[]> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        const data: any[] = [];

        sheet.eachRow(row => {
            data.push(
                row.getCell(
                    columnNumber
                ).value
            );
        });

        return data;
    }

    // =========================================================================
    // CELL
    // =========================================================================

    async getCellValue(
        filePath: string,
        sheetName: string,
        row: number,
        column: number
    ): Promise<any> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        return sheet
            .getRow(row)
            .getCell(column)
            .value;
    }

    // =========================================================================
    // SHEET DATA
    // =========================================================================

    async getSheetData(
        filePath: string,
        sheetName: string
    ): Promise<any[][]> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        const data: any[][] = [];

        sheet.eachRow(row => {

            data.push(
                (row.values as any[])
                    .slice(1)
                    .map(
                        value =>
                            value ?? ''
                    )
            );
        });

        return data;
    }

    async getSheetAsJson(
        filePath: string,
        sheetName: string
    ): Promise<any[]> {

        const workbook =
            await this.loadExcel(filePath);

        const sheet =
            workbook.getWorksheet(
                sheetName
            );

        if (!sheet) {
            throw new Error(
                `Sheet not found: ${sheetName}`
            );
        }

        const headers =
            sheet.getRow(1)
                .values as any[];

        const result: any[] = [];

        sheet.eachRow(
            (row, rowNumber) => {

                if (
                    rowNumber === 1
                ) {
                    return;
                }

                const obj:
                    Record<
                        string,
                        any
                    > = {};

                headers.forEach(
                    (
                        header,
                        index
                    ) => {

                        if (
                            !header ||
                            index === 0
                        ) {
                            return;
                        }

                        obj[
                            String(
                                header
                            )
                        ] =
                            row.getCell(
                                index
                            ).value;
                    }
                );

                result.push(obj);
            }
        );

        return result;
    }

    // =========================================================================
    // GENERIC
    // =========================================================================

    getTestData(
        dataFile: string,
        key: string
    ): any {

        const data =
            this.loadJSON(
                dataFile
            );

        return data[key] ?? null;
    }

    getAllTestData(
        dataFile: string
    ): any {

        return this.loadJSON(
            dataFile
        );
    }

    // =========================================================================
    // CACHE
    // =========================================================================

    clearCache(): void {
        this.cache.clear();
    }
}

export const testDataManager =
    new TestDataManager();

