$ErrorActionPreference = 'Stop'
$API = 'http://localhost:3000'

function Post($path, $body, $hdrs = @{}) {
  $h = @{ 'Content-Type' = 'application/json' } + $hdrs
  try {
    Invoke-RestMethod -Uri "$API$path" -Method Post -Headers $h -Body ($body | ConvertTo-Json -Depth 8) -TimeoutSec 30
  } catch {
    $d = $_.ErrorDetails.Message
    throw "POST $path failed: $($_.Exception.Message) $d"
  }
}
function Get($path, $hdrs = @{}) {
  Invoke-RestMethod -Uri "$API$path" -Method Get -Headers $hdrs -TimeoutSec 30
}

# 1. Super-admin login (env-bootstrap account)
$sa = Post '/api/auth/login' @{ email = 'admin@glambot.io'; password = 'admin123' }
$root = @{ Authorization = "Bearer $($sa.token)" }
Write-Output "SUPERADMIN OK role=$($sa.user.role)"

# 2. Tenant — reuse the existing demo salon if a previous run created it.
$slugBase = 'glam-luxe-dubai'
$tenant = $null
try {
  $list = Get '/api/tenants' $root
  $tenant = $list | Where-Object { $_.slug -eq $slugBase } | Select-Object -First 1
} catch { $tenant = $null }
if ($tenant) {
  Write-Output "TENANT exists id=$($tenant.id) slug=$($tenant.slug)"
} else {
  $tenant = Post '/api/tenants' @{ name = 'Glam Luxe Dubai'; timezone = 'Asia/Dubai'; plan = 'pro'; languageDefault = 'en' } $root
  Write-Output "TENANT created id=$($tenant.id) slug=$($tenant.slug) widgetKey=$($tenant.webWidgetKey)"
}
$widgetKey = $tenant.webWidgetKey
if (-not $widgetKey) { $widgetKey = (Get "/api/tenants/$($tenant.id)" $root).webWidgetKey }

# 3. Salon admin user
$salonEmail = 'salon@glamluxe.ae'
$salonPass  = 'GlamLuxe!2026'
try {
  $u = Post '/api/users' @{ email = $salonEmail; password = $salonPass; name = 'Glam Luxe Owner'; role = 'salon_admin'; tenantId = $tenant.id } $root
  Write-Output "SALON USER OK email=$($u.email)"
} catch {
  Write-Output "SALON USER exists/failed: $($_.Exception.Message)"
}

# 4. Salon-admin login -> tenant-scoped token
$sl = Post '/api/auth/login' @{ email = $salonEmail; password = $salonPass }
$tok = @{ Authorization = "Bearer $($sl.token)" }
Write-Output "SALON LOGIN OK tenant=$($sl.tenant.name)"

# 5. Services (bilingual; Arabic names loaded from UTF-8 JSON to avoid PS codepage mangling)
$catalog = Get-Content 'D:\glambot\demo-services.json' -Raw -Encoding UTF8 | ConvertFrom-Json
$svcIds = @()
foreach ($s in $catalog.services) {
  $c = Post '/api/tenants/me/services' @{
    nameEn = $s.nameEn; nameAr = $s.nameAr
    durationMinutes = $s.durationMinutes; bufferMinutes = $s.bufferMinutes
    price = $s.price
  } $tok
  $svcIds += $c.id
}
Write-Output "SERVICES OK count=$($svcIds.Count)"

# 6. Staff with full working week
$wh = @{
  Monday=@(@{start='09:00';end='18:00'}); Tuesday=@(@{start='09:00';end='18:00'});
  Wednesday=@(@{start='09:00';end='18:00'}); Thursday=@(@{start='09:00';end='20:00'});
  Friday=@(@{start='09:00';end='20:00'}); Saturday=@(@{start='10:00';end='16:00'})
} | ConvertTo-Json -Depth 6 -Compress

$staffIds = @()
$staffDefs = @(
  @{ name='Sarah Mansour'; skills=@(0,1,2) },
  @{ name='Nadia Haddad';  skills=@(0,2,3) },
  @{ name='Yasmin Ali';    skills=@(0,4,5) }
)
foreach ($st in $staffDefs) {
  $sk = ($st.skills | ForEach-Object { $svcIds[$_] }) | ConvertTo-Json -Compress
  $c = Post '/api/tenants/me/staff' @{ name = $st.name; workingHoursJson = $wh; skillsJson = $sk } $tok
  $staffIds += $c.id
}
Write-Output "STAFF OK count=$($staffIds.Count)"

# 7. Clients
$clientIds = @()
$clientDefs = @(
  @{ phone='+971501234567'; name='Layla Bouazizi'; isVip=$true  },
  @{ phone='+971502345678'; name='Mariam Cherif';  isVip=$false },
  @{ phone='+971503456789'; name='Huda Ben Amor';  isVip=$false },
  @{ phone='+971504567890'; name='Rania Trabelsi'; isVip=$true  },
  @{ phone='+971505678901'; name='Amira Sassi';    isVip=$false }
)
foreach ($c in $clientDefs) {
  $r = Post '/api/tenants/me/clients' $c $tok
  $clientIds += $r.id
}
Write-Output "CLIENTS OK count=$($clientIds.Count)"

# 8. Bookings across a few days.
#    The API contract is {date: 'YYYY-MM-DD', time: 'HH:mm'} (salon-local, Asia/Dubai),
#    status is limited to pending|confirmed, and the slot must fall inside a published shift.
function NextWorkday($daysAhead) {
  $d = (Get-Date).AddDays($daysAhead)
  while ($d.DayOfWeek -eq 'Saturday' -or $d.DayOfWeek -eq 'Sunday') { $d = $d.AddDays(1) }
  return $d.ToString('yyyy-MM-dd')
}
$bookDefs = @(
  @{ c=0; s=0; st=0; d=0; t='10:00'; status='confirmed' },
  @{ c=1; s=1; st=0; d=0; t='12:00'; status='pending'   },
  @{ c=2; s=2; st=1; d=0; t='14:00'; status='confirmed' },
  @{ c=3; s=3; st=1; d=1; t='11:00'; status='pending'   },
  @{ c=4; s=4; st=2; d=1; t='15:00'; status='confirmed' },
  @{ c=0; s=5; st=2; d=3; t='11:00'; status='confirmed' },
  @{ c=1; s=0; st=0; d=4; t='16:00'; status='confirmed' }
)
$made = 0
foreach ($b in $bookDefs) {
  $body = @{
    clientId = $clientIds[$b.c]
    staffId  = $staffIds[$b.st]
    serviceId = $svcIds[$b.s]
    date = (NextWorkday $b.d)
    time = $b.t
    status = $b.status
  }
  try { $null = Post '/api/tenants/me/bookings' $body $tok; $made++ }
  catch { Write-Output "  booking skipped: $($_.Exception.Message)" }
}
Write-Output "BOOKINGS OK created=$made"

# 9. Upsell rule (AI upsell engine) — bilingual messages are required by the schema.
try {
  $u = $catalog.upsell
  $null = Post '/api/tenants/me/upsell-rules' @{
    triggerServiceId  = $svcIds[$u.triggerIndex]
    suggestedServiceId = $svcIds[$u.suggestIndex]
    messageEn = $u.messageEn
    messageAr = $u.messageAr
    discountPercent = 10
    priority = 10
    isActive = $true
  } $tok
  Write-Output "UPSELL RULE OK"
} catch { Write-Output "UPSELL RULE skipped: $($_.Exception.Message)" }

Write-Output ''
Write-Output '=== CREDENTIALS ==='
Write-Output "SUPER_ADMIN  admin@glambot.io / admin123"
Write-Output "SALON_ADMIN  $salonEmail / $salonPass"
Write-Output "WIDGET_KEY   $widgetKey"
Write-Output "TENANT_SLUG $($tenant.slug)"
