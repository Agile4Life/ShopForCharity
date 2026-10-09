package vn.schoolshop.common;

import jakarta.persistence.*;
import org.springframework.stereotype.Repository;
import java.util.*;

/** Persistence-only adapter. Predicates are server-authored JPQL, never client text. */
@Repository
public class DomainRepository {
    private final EntityManager em;
    public DomainRepository(EntityManager em) { this.em=em; }
    public <T> T find(Class<T> type, UUID id) { var value=em.find(type,id); if(value==null) throw ApiException.missing(); return value; }
    public <T> T lock(Class<T> type, UUID id) { var value=em.find(type,id,LockModeType.PESSIMISTIC_WRITE); if(value==null) throw ApiException.missing(); return value; }
    public <T> T add(T value) { em.persist(value); return value; }
    public void remove(Object value) { em.remove(value); }
    public void flush() { em.flush(); }
    public <T> List<T> list(Class<T> type, String predicate, Map<String,?> params) { return page(type,predicate,params,0,10000,"e.createdAt asc"); }
    public <T> List<T> page(Class<T> type, String predicate, Map<String,?> params, int page,int size,String order) {
        var query=em.createQuery("select e from "+type.getSimpleName()+" e"+(predicate.isBlank()?"":" where "+predicate)+" order by "+order,type);
        params.forEach(query::setParameter);
        return query.setFirstResult(Math.max(0,page)*size).setMaxResults(size).getResultList();
    }
    public long count(Class<?> type,String predicate,Map<String,?> params) {
        var q=em.createQuery("select count(e) from "+type.getSimpleName()+" e"+(predicate.isBlank()?"":" where "+predicate),Long.class);
        params.forEach(q::setParameter); return q.getSingleResult();
    }
    public int execute(String jpql,Map<String,?> params) { var q=em.createQuery(jpql); params.forEach(q::setParameter);return q.executeUpdate(); }
}
