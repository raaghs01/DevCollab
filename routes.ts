/**
 * An Array of routes that are accessible to the public
 * These routes do not require authentication
 * @type {string[]}
 */

export const publicRoutes: string[] = [

]

/**
 * Route prefixes that are accessible without authentication, matched with
 * startsWith rather than exact equality. Playground pages need this: a
 * shared (isPublic) room must be reachable by guests, but which specific
 * playground is public isn't known at the routing layer — that's enforced
 * inside the page's own data fetch (getPlaygroundById), not here.
 * @type {string[]}
 */

export const publicRoutePrefixes: string[] = [
    "/playground/",
]

/**
 * An Array of routes that are protected
 * These routes require authentication
 * @type {string[]}
 */

export const protectedRoutes: string[] = [
    "/",
    
]

/**
 * An Array of routes that are accessible to the public
 * Routes that start with this (/api/auth) prefix do not require authentication
 * @type {string[]}
 */

export const authRoutes: string[] = [
    "/auth/sign-in",   // Added leading slash
   
]

/**
 * An Array of routes that are accessible to the public
 * Routes that start with this (/api/auth) prefix do not require authentication
 * @type {string}
 */

export const apiAuthPrefix: string = "/api/auth"

export const DEFAULT_LOGIN_REDIRECT = "/"; // Changed to redirect to home page after login
