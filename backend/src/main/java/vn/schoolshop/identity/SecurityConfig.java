package vn.schoolshop.identity;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.*;
import vn.schoolshop.common.*;

@Configuration
public class SecurityConfig {
  @Bean
  JwtDecoder jwtDecoder(
      @Value("${app.issuer}") String issuer,
      @Value("${app.jwks}") String jwks,
      @Value("${app.audience}") String audience) {
    var decoder =
        NimbusJwtDecoder.withJwkSetUri(jwks)
            .jwsAlgorithm(SignatureAlgorithm.RS256)
            .jwsAlgorithm(SignatureAlgorithm.ES256)
            .build();
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuer),
            jwt ->
                jwt.getAudience().contains(audience)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"))));
    return decoder;
  }

  @Bean
  CorsConfigurationSource cors(@Value("${app.cors-origins}") String origins) {
    var cfg = new CorsConfiguration();
    cfg.setAllowedOrigins(Arrays.asList(origins.split(",")));
    cfg.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
    cfg.setAllowedHeaders(
        List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"));
    cfg.setExposedHeaders(List.of("X-Request-Id", "Retry-After"));
    cfg.setAllowCredentials(true);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", cfg);
    return source;
  }

  @Bean
  RequestFilter requestFilter(@Value("${app.cors-origins}") String origins, ObjectMapper mapper) {
    return new RequestFilter(origins, mapper);
  }

  @Bean
  FilterRegistrationBean<RequestFilter> noDoubleRegistration(RequestFilter filter) {
    var bean = new FilterRegistrationBean<>(filter);
    bean.setEnabled(false);
    return bean;
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity http, RequestFilter filter, ObjectMapper mapper, ProfileService profiles)
      throws Exception {
    http.cors(c -> {})
        .csrf(c -> c.disable())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(
        a ->
            a.requestMatchers("/actuator/health/**", "/api/v1/health")
                .permitAll()
                .requestMatchers("/api/v1/me/**", "/api/v1/seller/**")
                .authenticated()
                .requestMatchers("/api/v1/**")
                .permitAll()
                .anyRequest()
                .denyAll());
    http.oauth2ResourceServer(
        o ->
            o.jwt(
                    j ->
                        j.jwtAuthenticationConverter(
                            jwt -> {
                              profiles.actor(jwt);
                              return new org.springframework.security.oauth2.server.resource
                                  .authentication.JwtAuthenticationToken(jwt);
                            }))
                .authenticationEntryPoint(
                    (req, res, e) ->
                        write(mapper, res, 401, "INVALID_TOKEN", "Phiên đăng nhập không hợp lệ.")));
    http.exceptionHandling(
        e ->
            e.authenticationEntryPoint(
                    (req, res, x) ->
                        write(mapper, res, 401, "AUTH_REQUIRED", "Vui lòng đăng nhập."))
                .accessDeniedHandler(
                    (req, res, x) ->
                        write(mapper, res, 403, "FORBIDDEN", "Không có quyền thực hiện.")));
    http.addFilterBefore(filter, BearerTokenAuthenticationFilter.class);
    return http.build();
  }

  static void write(
      ObjectMapper mapper,
      jakarta.servlet.http.HttpServletResponse res,
      int status,
      String code,
      String message)
      throws java.io.IOException {
    res.setStatus(status);
    res.setContentType("application/json");
    res.setHeader("Cache-Control", "no-store");
    mapper.writeValue(
        res.getOutputStream(),
        Views.map(
            "code",
            code,
            "message",
            message,
            "details",
            List.of(),
            "requestId",
            RequestContext.id(),
            "timestamp",
            java.time.Instant.now()));
  }
}
