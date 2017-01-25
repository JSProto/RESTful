import { Request, Response } from "express";
import * as orm from "sequelize";
import * as util from "util";
/**
 * SEntity where server returns as object or array of objects;
 */
export interface SEntity {
  id?: number;
  createdAt?: Date;
  updatedAt?: Date;
  href?: string;
}
/**
 * SSortArgs
 */
export interface SSortArgs {
  property: string;
  desc: boolean;
}
/**
 * SCollectionArgs
 */
export interface SCollectionArgs {
  href: string;
  limit: number;
  offset: number;
  count: number;
  previous?: string;
  next?: string;
}
/**
 * SResponse where server return minified.
 */
export interface SResponse<T> {
  code: number;
  message: string;
  data: T | Array<T>;
  href?: string;
  previous?: string;
  next?: string;
  count?: number;
  limit?: number;
  offset?: number;
}
/**
 * SError where server returns as error;
 */
export interface SError extends Error {
  status?: number;
}
/**
 * SRequest where server recieve request.
 */
export interface SRequest<T, V> {
  on(req: Request, res: Response, model: orm.Model<T, V>): void;
}
/**
 * SQuery where server recieve request.
 */
export interface SQuery<T> {
  on(req: Request, data: T | Array<T>): T | Array<T>;
}
/**
 * SObject where server parse object.
 */
export interface SObject<T> {
  on(data: T | Array<T>): T | Array<T>;
}
/**
 * isNullOrEmpty control
 */
export function isNullOrEmpty<T>(item: T): boolean {
  if (item === null || item === undefined) {
    return true;
  } else if (typeof item === "string") {
    return item === "";
  } else if (Array.isArray(item)) {
    return (<Array<any>> item).length === 0;
  } else {
    return JSON.stringify(item) === "{}";
  }
}
/**
 * toString control
 */
export function toString(format: string, ...args: any[]): string {
  return util.format(format, args);
}
