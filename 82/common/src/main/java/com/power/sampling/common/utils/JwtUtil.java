package com.power.sampling.common.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import lombok.extern.slf4j.Slf4j;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Slf4j
public class JwtUtil {

    private static final String SECRET = "power-sampling-cluster-secret-key-2024";
    private static final long EXPIRATION = 7 * 24 * 60 * 60 * 1000;
    private static final String CLAIM_KEY_USERNAME = "sub";
    private static final String CLAIM_KEY_USERID = "userId";
    private static final String CLAIM_KEY_ROLE = "role";
    private static final String CLAIM_KEY_CREATED = "created";

    public static String generateToken(Long userId, String username, String role) {
        Map<String, Object> claims = new HashMap<>();
        claims.put(CLAIM_KEY_USERNAME, username);
        claims.put(CLAIM_KEY_USERID, userId);
        claims.put(CLAIM_KEY_ROLE, role);
        claims.put(CLAIM_KEY_CREATED, new Date());
        return generateToken(claims);
    }

    private static String generateToken(Map<String, Object> claims) {
        Date expirationDate = new Date(System.currentTimeMillis() + EXPIRATION);
        return Jwts.builder()
                .setClaims(claims)
                .setExpiration(expirationDate)
                .signWith(SignatureAlgorithm.HS512, SECRET)
                .compact();
    }

    public static Claims getClaimsFromToken(String token) {
        Claims claims;
        try {
            claims = Jwts.parser()
                    .setSigningKey(SECRET)
                    .parseClaimsJws(token)
                    .getBody();
        } catch (Exception e) {
            log.error("JWT token解析失败: {}", e.getMessage());
            claims = null;
        }
        return claims;
    }

    public static String getUsernameFromToken(String token) {
        String username;
        try {
            Claims claims = getClaimsFromToken(token);
            username = claims != null ? claims.getSubject() : null;
        } catch (Exception e) {
            username = null;
        }
        return username;
    }

    public static Long getUserIdFromToken(String token) {
        Long userId;
        try {
            Claims claims = getClaimsFromToken(token);
            userId = claims != null ? Long.valueOf(claims.get(CLAIM_KEY_USERID).toString()) : null;
        } catch (Exception e) {
            userId = null;
        }
        return userId;
    }

    public static String getRoleFromToken(String token) {
        String role;
        try {
            Claims claims = getClaimsFromToken(token);
            role = claims != null ? claims.get(CLAIM_KEY_ROLE).toString() : null;
        } catch (Exception e) {
            role = null;
        }
        return role;
    }

    public static Boolean isTokenExpired(String token) {
        try {
            Claims claims = getClaimsFromToken(token);
            if (claims == null) {
                return true;
            }
            Date expiration = claims.getExpiration();
            return expiration.before(new Date());
        } catch (Exception e) {
            return true;
        }
    }

    public static Boolean validateToken(String token, String username) {
        String tokenUsername = getUsernameFromToken(token);
        return (username.equals(tokenUsername) && !isTokenExpired(token));
    }

    public static String refreshToken(String token) {
        String refreshedToken;
        try {
            Claims claims = getClaimsFromToken(token);
            claims.put(CLAIM_KEY_CREATED, new Date());
            refreshedToken = generateToken(claims);
        } catch (Exception e) {
            refreshedToken = null;
        }
        return refreshedToken;
    }
}
