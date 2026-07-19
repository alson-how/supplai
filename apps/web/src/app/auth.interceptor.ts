import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';

// Attaches the bearer token to API calls and clears the session on a 401 so the
// shell falls back to the login screen.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(ApiService);
  const token = localStorage.getItem('supplai_token');
  const authorised = token && req.url.includes('/api/') && !req.url.includes('/api/auth/login')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(authorised).pipe(catchError((error: HttpErrorResponse) => {
    if (error.status === 401 && !req.url.includes('/api/auth/login')) api.logout();
    return throwError(() => error);
  }));
};

export const FORECAST_METHODS = ['WEIGHTED_MOVING_AVERAGE', 'MOVING_AVERAGE', 'EXPONENTIAL_SMOOTHING', 'SEASONAL_TREND'] as const;
