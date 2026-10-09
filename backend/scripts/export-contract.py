"""Export the explicit HTTP contract as JSON-compatible YAML, without dependencies.

Request record schemas are read from Java source; route/response declarations below
are reviewed with the controllers. Run from backend: python scripts/export-contract.py
"""
from pathlib import Path
import json
import re

backend = Path(__file__).resolve().parents[1]
schemas = {}

def closing(text, start):
    depth, quoted, escaped = 1, False, False
    for i in range(start, len(text)):
        ch=text[i]
        if escaped:
            escaped=False
            continue
        if ch=='\\' and quoted:
            escaped=True
            continue
        if ch=='"':
            quoted=not quoted
        if quoted:
            continue
        depth += (ch=='(')-(ch==')')
        if not depth:
            return i
    raise ValueError('Unclosed record/annotation')

def clean_annotations(text):
    while True:
        match=re.search(r'@[\w.]+\s*',text)
        if not match:
            return re.sub(r'\s+',' ',text).strip()
        end=match.end()
        if end<len(text) and text[end]=='(':
            end=closing(text,end+1)+1
        text=text[:match.start()]+text[end:]

def split_fields(text):
    parts, start, position = [], 0, 0
    while position<len(text):
        if text[position]=='(':
            position=closing(text,position+1)
        elif text[position]==',':
            parts.append(text[start:position])
            start=position+1
        position+=1
    return parts+[text[start:]]

def ref(name):
    return {'$ref': '#/components/schemas/' + name}

def scalar(t):
    return {
        'String': {'type': 'string'}, 'UUID': {'type': 'string', 'format': 'uuid'},
        'Instant': {'type': 'string', 'format': 'date-time'},
        'BigDecimal': {'type': 'integer', 'minimum': 0, 'maximum': 99999999999999},
        'Integer': {'type': 'integer', 'format': 'int32'}, 'int': {'type': 'integer', 'format': 'int32'},
        'Long': {'type': 'integer', 'format': 'int64'}, 'long': {'type': 'integer', 'format': 'int64'},
        'Boolean': {'type': 'boolean'}, 'boolean': {'type': 'boolean'}
    }.get(t, ref(t))

for file in backend.joinpath('src/main/java').rglob('*.java'):
    if file.name not in {'CatalogDtos.java', 'CheckoutDtos.java', 'ShopService.java', 'ProfileService.java', 'PaymentService.java'}:
        continue
    source = file.read_text(encoding='utf-8')
    for record in re.finditer(r'public record (\w+)\(', source):
        name = record.group(1)
        if name == 'Input':
            name = 'PaymentInput'
        start = record.end()
        end = closing(source,start)
        fields = split_fields(source[start:end])
        properties, required = {}, []
        for field in fields:
            clean = clean_annotations(field).replace('< ','<').replace(' >','>')
            match = re.match(r'(.+)\s+(\w+)$', clean)
            if not match:
                raise ValueError((file, name, field))
            t, key = match.groups()
            prop = {'type': 'array', 'items': scalar(t[5:-1])} if t.startswith('List<') else scalar(t)
            if '@NotNull' in field or '@NotBlank' in field or t in {'long', 'int', 'boolean'}:
                required.append(key)
            size = re.search(r'@Size\(([^)]*)\)', field)
            if size:
                for bound, value in re.findall(r'(min|max)\s*=\s*(\d+)', size.group(1)):
                    prop[bound + ('Items' if t.startswith('List') else 'Length')] = int(value)
            for constraint, op in [('Min','minimum'),('Max','maximum'),('DecimalMin','minimum'),('DecimalMax','maximum')]:
                value = re.search(r'@' + constraint + r'\("?(\d+)"?\)', field)
                if value:
                    prop[op] = int(value.group(1))
            enum = re.search(r'@Pattern\(regexp\s*=\s*"([A-Z_|]+)"\)', field)
            if enum:
                prop['enum'] = enum.group(1).split('|')
            properties[key] = prop
        schemas[name] = {'type': 'object', 'additionalProperties': False, 'properties': properties}
        if required:
            schemas[name]['required'] = required

def obj(name, fields, required=()):
    properties={}
    for key, t in fields.items():
        properties[key] = {'type':'array','items':ref(t[2:])} if t.startswith('[]') else scalar(t)
    schemas[name]={'type':'object','properties':properties}
    if required:
        schemas[name]['required']=list(required)

obj('Error', {'code':'String','message':'String','requestId':'String','timestamp':'Instant'}, ['code','message','requestId','timestamp'])
schemas['Error']['properties']['details']={'oneOf':[{'type':'array','items':{'type':'object'}},{'type':'object'}]}
obj('CategoryView', {'id':'UUID','code':'String','name':'String','active':'boolean'})
obj('PickupView', {'id':'UUID','name':'String','instructions':'String','active':'boolean','version':'long'})
obj('ProfileView', {'id':'UUID','authUserId':'UUID','fullName':'String','phone':'String','email':'String','role':'String','active':'boolean','version':'long'})
obj('ShopView', {'id':'UUID','name':'String','contactPhone':'String','contactEmail':'String','acceptingOrders':'boolean','version':'long','pickupPoints':'[]PickupView'})
obj('SettingsView', {'id':'UUID','name':'String','contactPhone':'String','contactEmail':'String','acceptingOrders':'boolean','version':'long','bankName':'String','accountNumber':'String','accountHolder':'String','qrAssetId':'UUID','paymentSettingsVersionId':'UUID','pickupPoints':'[]PickupView'})
obj('ProductView', {'id':'UUID','slug':'String','name':'String','description':'String','categoryId':'UUID','categoryName':'String','price':'BigDecimal','imageAssetId':'UUID','imageUrl':'String','isSoldOut':'boolean','availableStock':'int','version':'long','status':'String','ingredients':'String','allergens':'String','preservationInstructions':'String','stockOnHand':'int','stockReserved':'int','inventoryVersion':'long'})
schemas['ProductView']['description']='Public view omits stockOnHand, stockReserved, inventoryVersion. Seller view includes them.'
obj('ComboComponentView', {'productId':'UUID','productName':'String','quantity':'int','availableStock':'int'})
obj('ComboView', {'id':'UUID','slug':'String','name':'String','description':'String','price':'BigDecimal','imageUrl':'String','imageAssetId':'UUID','isSoldOut':'boolean','availableStock':'int','version':'long','status':'String','retailTotal':'BigDecimal','savings':'BigDecimal','priceWarning':'boolean','items':'[]ComboComponentView'})
obj('QuoteLineView', {'kind':'String','catalogId':'UUID','name':'String','unitPrice':'BigDecimal','quantity':'int','lineTotal':'BigDecimal','availableStock':'int','isAvailable':'boolean'})
obj('QuoteView', {'quoteToken':'String','expiresAt':'Instant','subtotal':'BigDecimal','total':'BigDecimal','isAvailable':'boolean','items':'[]QuoteLineView'})
obj('CreatedOrder', {'orderId':'UUID','orderCode':'String','status':'String','paymentStatus':'String','total':'BigDecimal','reservationExpiresAt':'Instant','version':'long','guestAccessToken':'String'})
schemas['CreatedOrder']['description']='guestAccessToken is returned only to guest caller on creation and matching idempotent replay.'
obj('ComponentSnapshot', {'productId':'UUID','nameSnapshot':'String','unitsPerItem':'int'})
obj('ItemView', {'id':'UUID','kind':'String','productId':'UUID','comboId':'UUID','nameSnapshot':'String','imageUrlSnapshot':'String','unitPrice':'BigDecimal','quantity':'int','lineTotal':'BigDecimal','components':'[]ComponentSnapshot'})
obj('HistoryView', {'id':'UUID','fromStatus':'String','toStatus':'String','actorType':'String','reason':'String','createdAt':'Instant'})
obj('ContactView', {'id':'UUID','sellerId':'UUID','channel':'String','outcome':'String','note':'String','createdAt':'Instant'})
obj('PaymentEventView', {'id':'UUID','type':'String','fromStatus':'String','toStatus':'String','amount':'BigDecimal','bankReference':'String','note':'String','occurredAt':'Instant','createdAt':'Instant'})
obj('OrderView', {'id':'UUID','orderCode':'String','customerId':'UUID','buyerName':'String','buyerPhone':'String','buyerEmail':'String','buyerClass':'String','pickupPointId':'UUID','pickupPointName':'String','pickupInstructions':'String','requestedPickupAt':'Instant','confirmedPickupAt':'Instant','note':'String','paymentMethod':'String','paymentStatus':'String','status':'String','total':'BigDecimal','subtotal':'BigDecimal','reservationExpiresAt':'Instant','version':'long','createdAt':'Instant','updatedAt':'Instant','items':'[]ItemView','statusHistory':'[]HistoryView','contactAttempts':'[]ContactView','paymentEvents':'[]PaymentEventView','receivedAmount':'BigDecimal','paymentSettingsVersionId':'UUID'})
schemas['OrderView']['description']='Contact/payment events and receivedAmount are seller-only. Lists return scalar order summaries with empty items; detail contains item snapshots and timeline.'
obj('PaymentInstructions', {'orderCode':'String','bankName':'String','accountNumber':'String','accountHolder':'String','amount':'BigDecimal','transferContent':'String','qrSignedUrl':'String','expiresIn':'int','paymentSettingsVersionId':'UUID','waitForAcceptance':'boolean'})
obj('DashboardView', {'pendingCount':'long','readyCount':'long','completedRevenue':'BigDecimal','pendingRevenue':'BigDecimal'})
obj('NotificationView', {'id':'UUID','type':'String','orderId':'UUID','isRead':'boolean','createdAt':'Instant'})
obj('AuditView', {'id':'UUID','actorId':'UUID','actorType':'String','action':'String','entityType':'String','entityId':'UUID','safeBefore':'String','safeAfter':'String','requestId':'String','createdAt':'Instant'})
obj('StockView', {'productId':'UUID','stockOnHand':'int','stockReserved':'int','availableStock':'int','version':'long'})
obj('AssetView', {'assetId':'UUID','objectPath':'String','url':'String'})
obj('Success', {'success':'boolean'})
obj('Session', {'sessionId':'UUID'})
obj('Health', {'status':'String'})
for name in ['ProductView','ComboView','OrderView','NotificationView','AuditView']:
    obj(name+'Page', {'content':'[]'+name,'page':'int','size':'int','totalElements':'long','totalPages':'long'})
schemas['NotificationViewPage']['properties']['unreadCount']=scalar('long')
schemas['CreateProduct']=dict(schemas['ProductInput'],required=['name','categoryId','price'])
schemas['CreateCombo']=dict(schemas['ComboInput'],required=['name','price','items'])
schemas['ProductInput']['required']=['expectedVersion']
schemas['ComboInput']['required']=['expectedVersion']
schemas['ProfilePatch']['required']=['expectedVersion']
schemas['StockInput']['description']='Supply exactly one of absolute stockOnHand or deltaOnHand; expectedVersion is inventoryVersion.'
for name in ['ProductInput','CreateProduct']:
    schemas[name]['properties']['stockOnHand']=schemas[name]['properties']['initialStock']
    schemas[name]['properties']['preservationInstructions']=schemas[name]['properties']['storageInstructions']
schemas['PaymentInput']['description']='amount required for confirm-payment and confirm-refund. Refund amount must equal receivedAmount, not necessarily order total. reason required for dismiss-payment-report.'
schemas['ActionInput']['description']='reason required for cancel/reject. confirmedPickupPointId and future confirmedPickupAt required for accept.'

paths={}
def endpoint(method,path,response,body=None,secured=None,idem=False,query=(),status=200):
    parameters=[]
    for key in re.findall(r'{(\w+)}',path):
        parameters.append({'name':key,'in':'path','required':True,'schema':{'type':'string'}})
    if idem:
        parameters.append({'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','minLength':22,'maxLength':128},'description':'Random UUID v4. Reuse on retry with exactly the same payload.'})
    for key in query:
        parameters.append({'name':key,'in':'query','schema':{'type':'integer','minimum':0,'default':0 if key=='page' else 20,'maximum':100000 if key=='page' else 100} if key in {'page','size'} else {'type':'string'}})
    schema={'type':'array','items':ref(response[2:])} if response.startswith('[]') else ref(response)
    op={'operationId':method+'_'+re.sub(r'[^a-zA-Z0-9]+','_',path).strip('_'),'tags':[path.split('/')[1]],'security':[] if not secured else [{secured:[]}],'responses':{str(status):{'description':'Success','content':{'application/json':{'schema':schema}}}}}
    if parameters: op['parameters']=parameters
    if body:
        op['requestBody']={'required':True,'content':{'application/json':{'schema':ref(body)}}}
    for code in [400,401,403,404,409,413,415,429,503]:
        op['responses'][str(code)]={'description':'Standard API error','content':{'application/json':{'schema':ref('Error')}}}
    paths.setdefault(path,{})[method]=op

endpoint('get','/health','Health')
endpoint('get','/shop','ShopView')
endpoint('get','/categories','[]CategoryView')
for kind,name in [('products','ProductView'),('combos','ComboView')]:
    endpoint('get','/'+kind,name+'Page',query=['q','category','sort','page','size'])
    endpoint('get','/'+kind+'/{id}',name)
    endpoint('get','/seller/'+kind,name+'Page',secured='bearer',query=['q','category','sort','page','size'])
    endpoint('get','/seller/'+kind+'/{id}',name,secured='bearer')
    endpoint('post','/seller/'+kind,name,body='CreateProduct' if kind=='products' else 'CreateCombo',secured='bearer')
    endpoint('patch','/seller/'+kind+'/{id}',name,body='ProductInput' if kind=='products' else 'ComboInput',secured='bearer')
    for action in ['activate','archive']:
        endpoint('post','/seller/'+kind+'/{id}/'+action,name,'VersionInput','bearer')
endpoint('post','/seller/products/{id}/stock-adjustments','StockView','StockInput','bearer',True)
endpoint('post','/checkout/session','Session')
endpoint('post','/checkout/quote','QuoteView','QuoteInput')
endpoint('post','/orders','CreatedOrder','CreateInput',idem=True,status=201)
paths['/orders']['post']['security']=[{'bearer':[]},{'checkoutCookie':[]}]
endpoint('get','/me','ProfileView',secured='bearer')
endpoint('patch','/me','ProfileView','ProfilePatch','bearer')
endpoint('get','/me/orders','OrderViewPage',secured='bearer',query=['page','size'])
endpoint('get','/seller/orders','OrderViewPage',secured='bearer',query=['status','paymentStatus','orderCode','date','page','size'])
endpoint('post','/guest/orders/access','Success','AccessInput')
for prefix,key,security in [('me','id','bearer'),('guest','code','guestCookie'),('seller','id','bearer')]:
    base='/'+prefix+'/orders/{'+key+'}'
    endpoint('get',base,'OrderView',secured=security)
    endpoint('get',base+'/payment-instructions','PaymentInstructions',secured=security)
    endpoint('post',base+'/cancel','OrderView','ActionInput',security,True)
    if prefix!='seller':
        endpoint('post',base+'/payment-report','OrderView','PaymentInput',security,True)
    else:
        endpoint('post',base+'/contact-attempts','OrderView','ContactInput',security,True)
        for action in ['accept','reject','prepare','ready','complete']:
            endpoint('post',base+'/'+action,'OrderView','ActionInput',security,True)
        for action in ['confirm-payment','dismiss-payment-report','confirm-refund']:
            endpoint('post',base+'/'+action,'OrderView','PaymentInput',security,True)
endpoint('get','/seller/dashboard','DashboardView',secured='bearer')
endpoint('get','/seller/shop-settings','SettingsView',secured='bearer')
endpoint('patch','/seller/shop-settings','SettingsView','SettingsInput','bearer')
endpoint('get','/seller/pickup-points','[]PickupView',secured='bearer')
endpoint('post','/seller/pickup-points','PickupView','PointInput','bearer')
endpoint('patch','/seller/pickup-points/{id}','PickupView','PointInput','bearer')
endpoint('get','/seller/notifications','NotificationViewPage',secured='bearer',query=['page','size'])
endpoint('post','/seller/notifications/{id}/read','Success',secured='bearer')
endpoint('get','/seller/audit-logs','AuditViewPage',secured='bearer',query=['action','entityType','date','page','size'])
endpoint('post','/seller/assets','AssetView',secured='bearer')
paths['/seller/assets']['post']['requestBody']={'required':True,'content':{'multipart/form-data':{'schema':{'type':'object','required':['file','type'],'properties':{'file':{'type':'string','format':'binary'},'type':{'type':'string','enum':['PRODUCT_IMAGE','PAYMENT_QR']}}}}}}
document={'openapi':'3.0.3','info':{'title':'School Shop Backend','version':'0.1.0','description':'Private Spring Boot business API. Cookie mutations require allowlisted Origin. JWT is always verified when supplied. Prices are integer VND. Expected version and idempotency are mandatory where documented.'},'servers':[{'url':'/api/v1'}],'paths':paths,'components':{'schemas':schemas,'securitySchemes':{'bearer':{'type':'http','scheme':'bearer','bearerFormat':'JWT'},'guestCookie':{'type':'apiKey','in':'cookie','name':'guest_order'},'checkoutCookie':{'type':'apiKey','in':'cookie','name':'checkout_session'}}}}
destination=backend.parent/'docs/openapi.yaml'
def validate_refs(value):
    if isinstance(value,dict):
        if '$ref' in value:
            assert value['$ref'].split('/')[-1] in schemas, value['$ref']
        for child in value.values(): validate_refs(child)
    elif isinstance(value,list):
        for child in value: validate_refs(child)
validate_refs(document)
destination.write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Exported {sum(len(p) for p in paths.values())} operations, {len(schemas)} schemas to {destination}')
