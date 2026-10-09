package vn.schoolshop.identity;

import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Cookie writes require trusted Origin; bearer identity never falls back to cookies. */
public class RequestFilter extends OncePerRequestFilter {
    private final Set<String> origins;
    private final ObjectMapper mapper;
    private final ConcurrentHashMap<String,Window> windows=new ConcurrentHashMap<>();
    private record Window(long minute,int count){}
    public RequestFilter(String origins,ObjectMapper mapper) {this.origins=Set.of(origins.split(","));this.mapper=mapper;}
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,java.io.IOException {
        String id=UUID.randomUUID().toString();MDC.put("requestId",id);res.setHeader("X-Request-Id",id);
        long start=System.nanoTime();
        try {
            res.setHeader("Cache-Control","private, no-store");
            boolean mutation=Set.of("POST","PATCH","PUT","DELETE").contains(req.getMethod());
            boolean bearer=req.getHeader("Authorization")!=null;
            if(mutation&&!bearer&&!origins.contains(req.getHeader("Origin"))) {SecurityConfig.write(mapper,res,403,"CSRF_ORIGIN_REJECTED","Nguồn yêu cầu không hợp lệ.");return;}
            if(req.getRequestURI().equals("/api/v1/guest/orders/access")&&req.getMethod().equals("POST")&&!allow("access:"+req.getRemoteAddr(),10)) {res.setHeader("Retry-After","60");SecurityConfig.write(mapper,res,429,"RATE_LIMITED","Vui lòng thử lại sau.");return;}
            chain.doFilter(req,res);
        } finally {
            Object route=req.getAttribute(org.springframework.web.servlet.HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            LoggerFactory.getLogger(getClass()).info("requestId={} method={} route={} status={} durationMs={}",id,req.getMethod(),route==null?"unmatched":route,res.getStatus(),(System.nanoTime()-start)/1_000_000);
            MDC.remove("requestId");
        }
    }
    public boolean allow(String key,int limit) {
        long minute=System.currentTimeMillis()/60000;
        if(windows.size()>10000)windows.entrySet().removeIf(e->e.getValue().minute()<minute);
        return windows.compute(key,(k,w)->w==null||w.minute()!=minute?new Window(minute,1):new Window(minute,w.count()+1)).count()<=limit;
    }
}
