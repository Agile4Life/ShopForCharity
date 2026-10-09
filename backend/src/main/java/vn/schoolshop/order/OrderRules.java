package vn.schoolshop.order;
import java.util.Set;
import vn.schoolshop.common.ApiException;
import static vn.schoolshop.common.ApiException.check;
public final class OrderRules {
    private OrderRules(){}
    public static boolean terminal(String status){return Set.of("COMPLETED","CANCELLED","REJECTED","EXPIRED").contains(status);}
    public static void transition(String from,String to,String payment,boolean seller,boolean contact){
        boolean valid=switch(to){
            case "ACCEPTED" -> seller&&from.equals("PENDING_CONTACT")&&contact;
            case "PREPARING" -> seller&&from.equals("ACCEPTED");
            case "READY" -> seller&&from.equals("PREPARING");
            case "COMPLETED" -> seller&&from.equals("READY")&&payment.equals("PAID");
            case "REJECTED" -> seller&&from.equals("PENDING_CONTACT");
            case "CANCELLED" -> !terminal(from)&&(seller||(from.equals("PENDING_CONTACT")&&payment.equals("UNPAID")));
            case "EXPIRED" -> from.equals("PENDING_CONTACT")&&payment.equals("UNPAID");
            default -> false;
        };
        check(valid,409,"INVALID_TRANSITION","Không thể thực hiện ở trạng thái hiện tại.");
    }
}
