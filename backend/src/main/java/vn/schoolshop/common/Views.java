package vn.schoolshop.common;
import java.util.*;
public final class Views {
    private Views() {}
    public static Map<String,Object> map(Object... pairs) {
        var out=new LinkedHashMap<String,Object>();
        for(int i=0;i<pairs.length;i+=2) out.put((String)pairs[i],pairs[i+1]);
        return out;
    }
    public static int size(int value) { return Math.max(1,Math.min(100,value)); }
}
