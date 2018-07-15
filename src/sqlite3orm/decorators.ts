// tslint:disable-next-line: no-import-side-effect
import 'reflect-metadata';

import {Field} from './Field';
import {FieldReference} from './FieldReference';
import {TableReference} from './TableReference';
import {schema} from './Schema';
import {Table} from './Table';

export const METADATA_TABLE_KEY = 'schema:table';

/**
 * Options for the '@table' class decorator
 *
 * @export
 * @interface TableOpts
 */
export interface TableOpts {
  /**
   * The name of the table
   * @type
   */
  name?: string;

  /**
   * Flag to indicate if table should be created using the 'WITHOUT ROWID'
   * clause
   * @type
   */
  withoutRowId?: boolean;
  /**
   * Flag to indicate if AUTOINCREMENT should be added to single-column INTEGER
   * primary keys
   * @type
   */
  autoIncrement?: boolean;
}

/**
 * Options for the property decorators '@field' and '@id'
 *
 * @export
 * @interface FieldOpts
 */
export interface FieldOpts {
  /**
   * The name of the table field
   * @type
   */
  name?: string;
  /**
   * The column definition
   * @type
   */
  dbtype?: string;
  /**
   * Flag to indicate if field should be persisted to json string
   * @type
   */
  isJson?: boolean;
}

/**
 * Get the table metadata
 *
 * @param target - The constructor of the class
 * @returns The table class instance
 */
function getTableMetadata(target: Function): Table {
  if (!Reflect.hasOwnMetadata(METADATA_TABLE_KEY, target.prototype)) {
    Reflect.defineMetadata(METADATA_TABLE_KEY, new Table(target.name), target.prototype);
  }
  return Reflect.getMetadata(METADATA_TABLE_KEY, target.prototype);
}

/**
 * Get the field metadata
 *
 * @param table - The table of this field
 * @param key - The property key
 * @returns The field class instance
 */
function getFieldMetadata(metaTable: Table, key: string|symbol): Field {
  let metaField: Field;
  if (metaTable.hasPropertyField(key)) {
    metaField = metaTable.getPropertyField(key);
  } else {
    metaField = new Field(key);
    metaTable.addPropertyField(metaField);
  }
  return metaField;
}

/**
 * Helper function for decorating a class and map it to a database table
 *
 * @param target - The constructor of the class
 * @param [opts] - The options for this table
 */
function decorateTableClass(target: Function, opts: TableOpts): void {
  const metaTable = getTableMetadata(target);
  const newTableName = opts.name || target.name;

  if (!!metaTable.name && newTableName !== metaTable.name) {
    throw new Error(
        `failed to map class '${
                                target.name
                              }' to table name '${
                                                  newTableName
                                                }': This class is already mapped to the table '${metaTable.name}'`);
  }


  metaTable.name = newTableName;
  if (!!opts.withoutRowId) {
    metaTable.withoutRowId = true;
  }
  if (!!opts.autoIncrement) {
    metaTable.autoIncrement = true;
  }
  schema().addTable(metaTable);
}

/**
 * Helper function for decorating a property and map it to a table field
 *
 * @param target - The decorated class
 * @param key - The decorated property
 * @param [opts] - The options for this field
 * @param [isIdentity=false] - Indicator if this field belongs to the
 * primary key
 * @returns The field class instance
 */
function decorateFieldProperty(
    target: Object|Function, key: string|symbol, opts: FieldOpts, isIdentity: boolean = false): Field {
  if (typeof target === 'function') {
    // not decorating static property
    throw new Error(`decorating static property '${key.toString()}' using field-decorator is not supported`);
  }

  const metaTable: Table = getTableMetadata(target.constructor);
  const metaField: Field = getFieldMetadata(metaTable, key);

  metaField.propertyType = Reflect.getMetadata('design:type', target, key);
  metaField.name = opts.name || key.toString();

  if (!!opts.dbtype) {
    metaField.dbtype = opts.dbtype;
  }
  if (!!opts.isJson) {
    metaField.isJson = opts.isJson;
  }
  if (!!isIdentity) {
    metaField.isIdentity = isIdentity;
  }
  return metaField;
}


/**
 * Helper function for decorating a property and map it to a foreign key field
 *
 * @param target - The decorated class
 * @param key - The decorated property
 * @param constraintName - The name for the foreign key constraint
 * @param foreignTableName - The referenced table name
 * @param foreignTableField - The referenced table field
 * @returns - The field class instance
 */
function decorateForeignKeyProperty(
    target: Object|Function, key: string|symbol, constraintName: string, foreignTableName: string,
    foreignTableField: string): Field {
  if (typeof target === 'function') {
    // not decorating static property
    throw new Error(`decorating static property '${key.toString()}' using fk-decorator is not supported`);
  }

  const metaTable: Table = getTableMetadata(target.constructor);
  let tableRef = metaTable.hasTableReference(constraintName);
  if (!tableRef) {
    tableRef = new TableReference(constraintName, foreignTableName);
    metaTable.addTableReference(tableRef);
  }

  const metaField: Field = getFieldMetadata(metaTable, key);
  if (metaField.hasForeignKeyField(constraintName)) {
    throw new Error(`decorating property '${
                                            target.constructor.name
                                          }.${key.toString()}': duplicate foreign key constraint '${constraintName}'`);
  }

  metaField.setForeignKeyField(constraintName, new FieldReference(tableRef, foreignTableField));
  return metaField;
}

/**
 * Helper function for decorating a property and map it to an index field
 *
 * @param target - The decorated class
 * @param key - The decorated property
 * @param indexName - The name for the index
 * @returns The field class instance
 */
function decorateIndexProperty(target: Object|Function, key: string|symbol, indexName: string): Field {
  if (typeof target === 'function') {
    // not decorating static property
    throw new Error(`decorating static property '${key.toString()}' using index-decorator is not supported`);
  }

  const metaTable: Table = getTableMetadata(target.constructor);
  const metaField: Field = getFieldMetadata(metaTable, key);
  if (metaField.isIndexField(indexName)) {
    throw new Error(
        `decorating property '${target.constructor.name}.${key.toString()}': duplicate index key '${indexName}'`);
  }

  metaField.setIndexField(indexName);
  return metaField;
}

/*****************************************************************************************/
/* decorators:

/**
 * The class decorator for mapping a database table to a class
 *
 * @export
 * @param [opts]
 * @returns The decorator function
 */
export function table(opts: TableOpts = {}): (target: Function) => void {
  return ((target: Function) => decorateTableClass(target, opts));
}

/**
 * The property decorator for mapping a table field to a class property
 *
 * @export
 * @param [name] - The name of the field; defaults to the property name
 * @param [dbtype] - The type of the field; defaults to 'TEXT'
 * @returns The decorator function
 */
export function field(opts: FieldOpts = {}): (target: Object, key: string|symbol) => void {
  return ((target: Object, key: string | symbol) => {
    decorateFieldProperty(target, key, opts, false);
  });
}

/**
 * The id decorator for mapping a field of the primary key to a class property
 *
 * @export
 * @param [name] - The name of the field; defaults to the property name
 * @param [dbtype] - The type of the field; defaults to 'TEXT'
 * @returns The decorator function
 */
export function id(opts: FieldOpts = {}): (target: Object, key: string|symbol) => void {
  return ((target: Object, key: string | symbol) => {
    decorateFieldProperty(target, key, opts, true);
  });
}

/**
 * The fk decorator for mapping a class property to be part of a foreign key
 * constraint
 *
 * @export
 * @param constraintName - The constraint name
 * @param foreignTableName - The referenced table name
 * @param foreignTableField - The referenced table field
 * @returns The decorator function
 */
export function fk(constraintName: string, foreignTableName: string, foreignTableField: string): (
    target: Object, key: string|symbol) => void {
  return ((target: Object, key: string | symbol) => {
    decorateForeignKeyProperty(target, key, constraintName, foreignTableName, foreignTableField);
  });
}

/**
 * The index decorator for mapping a class property to be part of an index
 *
 * @export
 * @param indexName - The index name
 * @returns The decorator function
 */
export function index(indexName: string): (target: Object, key: string|symbol) => void {
  return ((target: Object, key: string | symbol) => {
    decorateIndexProperty(target, key, indexName);
  });
}
