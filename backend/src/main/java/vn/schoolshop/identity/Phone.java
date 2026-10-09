package vn.schoolshop.identity;
import vn.schoolshop.common.ApiException;
public final class Phone {
    private Phone(){}
    public static String normalize(String phone) {
        String s=phone.replaceAll("[\\s().-]","");if(s.startsWith("+84"))s="0"+s.substring(3);
        ApiException.check(s.matches("0[0-9]{9}"),400,"INVALID_PHONE","Số điện thoại phải có 10 chữ số hoặc dạng +84 tương ứng.");return s;
    }
}
