export interface PageQuery { page: number; pageSize: number; search?: string; status?: string }
export interface Page<T> { data: T[]; page: number; pageSize: number; total: number; totalPages: number }

export function paginate<T>(records: T[], query: PageQuery): Page<T> {
  const offset = (query.page - 1) * query.pageSize;
  return { data: records.slice(offset, offset + query.pageSize), page: query.page, pageSize: query.pageSize, total: records.length, totalPages: Math.ceil(records.length / query.pageSize) };
}
