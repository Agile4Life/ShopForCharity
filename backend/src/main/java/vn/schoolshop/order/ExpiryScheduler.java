package vn.schoolshop.order;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
@Component
public class ExpiryScheduler {
    private final OrderService orders;
    public ExpiryScheduler(OrderService orders){this.orders=orders;}
    @Scheduled(fixedDelayString="${app.expiry-interval-ms:60000}",initialDelayString="${app.expiry-interval-ms:60000}")
    public void expire(){orders.expire();}
}
