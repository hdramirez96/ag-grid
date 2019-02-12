import {ChartDatasource} from "./chart";
import {
    Autowired,
    BeanStub,
    Column,
    ColumnController,
    Events,
    EventService,
    IRowModel,
    PaginationProxy,
    PostConstruct,
    RangeSelection,
    ValueService
} from "ag-grid-community";

export class ChartRangeDatasource extends BeanStub implements ChartDatasource {

    @Autowired('columnController') columnController: ColumnController;
    @Autowired('valueService') valueService: ValueService;
    @Autowired('rowModel') rowModel: IRowModel;
    @Autowired('paginationProxy') paginationProxy: PaginationProxy;
    @Autowired('eventService') eventService: EventService;

    private rangeSelection: RangeSelection;

    private colIds: string[];
    private colDisplayNames: string[];
    private colsMapped: {[colId: string]: Column};

    private categoryCols: Column[];

    private startRow: number;
    private endRow: number;
    private rowCount: number;

    constructor(rangeSelection: RangeSelection) {
        super();
        this.rangeSelection = rangeSelection;
    }

    @PostConstruct
    private postConstruct(): void {
        this.calculateFields();
        this.calculateRowRange();
        this.calculateCategoryCols();

        this.addDestroyableEventListener(this.eventService, Events.EVENT_MODEL_UPDATED, this.onModelUpdated.bind(this));
        this.addDestroyableEventListener(this.eventService, Events.EVENT_CELL_VALUE_CHANGED, this.onModelUpdated.bind(this));
    }

    private calculateCategoryCols(): void {
        this.categoryCols = [];
        if (!this.rangeSelection.columns) { return; }

        if (this.columnController.isPivotMode()) {
            console.warn('ag-Grid: ChartRangeDatasource doesnt handle pivot mode yet');
        }

        const isDimension = (col:Column) => col.getColDef().enableRowGroup || col.getColDef().enablePivot;

        // pull out all dimension columns from the range
        this.rangeSelection.columns.forEach( col => {
            if (isDimension(col)) {
                this.categoryCols.push(col);
            }
        });

        // if no dimension columns in the range, then pull out first dimension column from primary columns
        if (this.categoryCols.length===0) {
            const primaryCols = this.columnController.getAllPrimaryColumns();
            primaryCols!.forEach( col => {
                if (this.categoryCols.length===0 && isDimension(col)) {
                    this.categoryCols.push(col);
                }
            });
        }

    }

    private onModelUpdated(): void {
        this.calculateRowCount();
        this.dispatchEvent({type: 'modelUpdated'});
    }

    private calculateRowRange(): void {
        const paginationOffset = this.paginationProxy.getPageFirstRow();
        this.startRow = this.rangeSelection.start.rowIndex + paginationOffset;
        this.endRow = this.rangeSelection.end.rowIndex + paginationOffset;
        this.calculateRowCount();
    }

    private calculateRowCount(): void {
        // make sure enough rows in range to chart. if user filters and less rows, then
        // end row will be the last displayed row, not where the range ends.
        const maxRow = this.rowModel.getRowCount();
        const lastRow = Math.min(this.endRow, maxRow);
        this.rowCount = lastRow - this.startRow + 1;
    }

    private calculateFields(): void {
        const cols = this.rangeSelection.columns;

        this.colIds = [];
        this.colDisplayNames = [];
        this.colsMapped = {};

        if (!cols) { return; }

        cols.forEach( col => {
            // only measure columns can be values
            if (!col.getColDef().enableValue) { return; }

            const colId = col.getColId();
            const displayName = this.columnController.getDisplayNameForColumn(col, 'chart');

            this.colIds.push(colId);
            this.colDisplayNames.push(displayName ? displayName : '');

            this.colsMapped[colId] = col;
        });
    }

    public getCategory(i: number): string {
        const rowNode = this.rowModel.getRow(this.startRow + i);
        const resParts: string[] = [];
        this.categoryCols.forEach( col => {
            const part = this.valueService.getValue(col, rowNode);
            // force return type to be string or empty string (as value can be an object)
            const partStr = (part && part.toString) ? part.toString() : '';
            resParts.push(partStr);
        });
        const res = resParts.join(', ');
        return res;
    }

    public getFields(): string[] {
        return this.colIds;
    }

    public getFieldNames(): string[] {
        return this.colDisplayNames;
    }

    public getValue(i: number, field: string): number {
        const rowNode = this.rowModel.getRow(this.startRow + i);
        const col = this.colsMapped[field];
        const res = this.valueService.getValue(col, rowNode);
        return res;
    }

    public getRowCount(): number {
        return this.rowCount;
    }

}