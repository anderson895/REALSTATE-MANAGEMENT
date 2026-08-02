<#
.SYNOPSIS
    Extracts the legacy .xls requirement workbooks into reviewable JSON fixtures.

.DESCRIPTION
    Source of truth for the seed pipeline (Development Plan.md §6.3).

    Reads via ACE.OLEDB rather than Excel COM: Excel automation on this machine
    fails with RPC_E_CALL_REJECTED after a single call and then reports zero
    worksheets. ACE.OLEDB is stable and needs no running Excel instance.

    Normalisation applied here, once, so the loader stays trivial:
      - currency strings ("₱15,000,000" / "15,000,000.00") -> integer centavos
      - header aliases unified (Price/sqm == Price per sqm, etc.)
      - missing Tower column -> null

    Writes JSON to scripts/seed/data/. Output is committed so the seeded data
    is reviewable in diffs rather than hidden inside a binary workbook.

.EXAMPLE
    npm run seed:extract
#>
[CmdletBinding()]
param(
    [string]$SourceDir,
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is unreliable inside param defaults under Windows PowerShell 5.1,
# so resolve here instead.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SourceDir) { $SourceDir = (Resolve-Path (Join-Path $scriptDir '..\..')).Path }
if (-not $OutDir) { $OutDir = Join-Path $scriptDir 'data' }

# ── Helpers ──────────────────────────────────────────────────────────────────

function Read-Sheet {
    <#  Returns the sheet as an array of string arrays (raw cell text). #>
    param([string]$Path, [string]$Sheet)

    $cs = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$Path;" +
          'Extended Properties="Excel 8.0;HDR=NO;IMEX=1";'
    $conn = New-Object System.Data.OleDb.OleDbConnection($cs)
    $conn.Open()
    try {
        $cmd = New-Object System.Data.OleDb.OleDbCommand("SELECT * FROM [$Sheet]", $conn)
        $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
        $table = New-Object System.Data.DataTable
        [void]$adapter.Fill($table)

        $rows = @()
        foreach ($row in $table.Rows) {
            $cells = @()
            foreach ($col in $table.Columns) {
                $v = $row[$col]
                if ($v -is [System.DBNull]) { $cells += '' }
                else { $cells += ([string]$v).Trim() }
            }
            $rows += , $cells
        }
        return $rows
    }
    finally { $conn.Close() }
}

function Get-SheetNames {
    param([string]$Path)
    $cs = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$Path;" +
          'Extended Properties="Excel 8.0;HDR=NO;IMEX=1";'
    $conn = New-Object System.Data.OleDb.OleDbConnection($cs)
    $conn.Open()
    try {
        $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
        return @($schema | Select-Object -ExpandProperty TABLE_NAME)
    }
    finally { $conn.Close() }
}

function ConvertTo-Centavos {
    <#  "₱15,000,000" | "15,000,000.00" | "" -> 1500000000 | null  #>
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    $clean = $Text -replace '[^\d.]', ''
    if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
    $pesos = [decimal]$clean
    return [long][math]::Round($pesos * 100)
}

function ConvertTo-Number {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    $clean = $Text -replace '[^\d.]', ''
    if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
    return [double]$clean
}

function Find-HeaderRow {
    <#  Index of the first row whose first cell equals $Marker (case-insensitive). #>
    param([array]$Rows, [string]$Marker)
    for ($i = 0; $i -lt $Rows.Count; $i++) {
        if ($Rows[$i][0] -and $Rows[$i][0].Trim().ToLower() -eq $Marker.ToLower()) { return $i }
    }
    return -1
}

function Get-DetailValue {
    <#  Pulls "Project Name: The Legaspi Place" -> "The Legaspi Place" #>
    param([array]$Rows, [string]$Label)
    foreach ($row in $Rows) {
        $cell = $row[0]
        if ($cell -and $cell -match "^\s*$([regex]::Escape($Label))\s*:\s*(.+)$") {
            return $Matches[1].Trim()
        }
    }
    return $null
}

function Coalesce {
    <#  Windows PowerShell 5.1 has no ?? operator. #>
    param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Values)
    foreach ($v in $Values) {
        if ($null -ne $v -and -not [string]::IsNullOrWhiteSpace([string]$v)) { return $v }
    }
    return $null
}

function Write-Json {
    param([string]$Name, $Data)
    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
    $path = Join-Path $OutDir $Name
    $json = $Data | ConvertTo-Json -Depth 10
    # UTF-8 without BOM. PowerShell's -Encoding UTF8 adds a BOM that breaks
    # some JSON parsers, so write the bytes directly.
    [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
    $count = if ($Data -is [array]) { $Data.Count } else { 1 }
    Write-Host ("  {0,-24} {1,4} record(s)" -f $Name, $count)
}

# ── Project inventory ────────────────────────────────────────────────────────

Write-Host "`nExtracting inventory from DATABASE PROJECT.xls"
$dbPath = Join-Path $SourceDir 'DATABASE PROJECT.xls'

# Sheet name -> the project code used across the system.
$projectSheets = @(
    @{ Sheet = "'legaspi place`$'"; Code = 'TLP001' }
    @{ Sheet = 'Emerald$';         Code = 'EPR002' }
    @{ Sheet = 'skyline$';         Code = 'SQR003' }
    @{ Sheet = 'grandverdant$';    Code = 'GVR004' }
    @{ Sheet = "'harbor point`$'"; Code = 'HPR004' }
)

$projects = @()
$units = @()
$parking = @()

foreach ($spec in $projectSheets) {
    $rows = Read-Sheet -Path $dbPath -Sheet $spec.Sheet

    $projects += [ordered]@{
        id           = $spec.Code
        name         = Get-DetailValue $rows 'Project Name'
        code         = Get-DetailValue $rows 'Project Code'
        developer    = Coalesce (Get-DetailValue $rows 'Developer') 'St. Francis Square Realty Corporation'
        location     = Get-DetailValue $rows 'Location'
        buildingType = Coalesce (Get-DetailValue $rows 'Building Type') (Get-DetailValue $rows 'Type')
        floorsRaw    = Coalesce (Get-DetailValue $rows 'Floors') (Get-DetailValue $rows 'No. of Floors')
        theme        = Get-DetailValue $rows 'Theme'
        sourceSheet  = $spec.Sheet
    }

    # ── Units ──
    $h = Find-HeaderRow $rows 'Unit ID'
    if ($h -lt 0) { throw "No 'Unit ID' header found in $($spec.Sheet)" }
    $header = $rows[$h]
    $hasTower = ($header -join '|') -match '(?i)tower'

    # The parking section reuses the same ID shape (PK001 looks like a unit id),
    # so the unit scan must stop at the parking header rather than run to EOF.
    $parkingHeader = Find-HeaderRow $rows 'Parking ID'
    $unitEnd = if ($parkingHeader -gt $h) { $parkingHeader } else { $rows.Count }

    for ($i = $h + 1; $i -lt $unitEnd; $i++) {
        $r = $rows[$i]
        if (-not $r[0] -or $r[0] -notmatch '^[A-Z]{1,3}\d{3}$') { continue }

        # Column layout differs: sheets with a Tower column shift right by one.
        if ($hasTower) {
            $units += [ordered]@{
                id                    = $r[0]
                projectId             = $spec.Code
                tower                 = if ($r[2]) { $r[2] } else { $null }
                floor                 = ConvertTo-Number $r[3]
                unitNo                = $r[4]
                unitType              = $r[5]
                areaSqm               = ConvertTo-Number $r[6]
                pricePerSqmCentavos   = ConvertTo-Centavos $r[7]
                purchasePriceCentavos = ConvertTo-Centavos $r[8]
                status                = if ($r[9]) { $r[9] } else { 'Available' }
            }
        }
        else {
            $units += [ordered]@{
                id                    = $r[0]
                projectId             = $spec.Code
                tower                 = $null
                floor                 = ConvertTo-Number $r[2]
                unitNo                = $r[3]
                unitType              = $r[4]
                areaSqm               = ConvertTo-Number $r[5]
                pricePerSqmCentavos   = ConvertTo-Centavos $r[6]
                purchasePriceCentavos = ConvertTo-Centavos $r[7]
                status                = if ($r[8]) { $r[8] } else { 'Available' }
            }
        }
    }

    # ── Parking ──
    $p = Find-HeaderRow $rows 'Parking ID'
    if ($p -lt 0) { throw "No 'Parking ID' header found in $($spec.Sheet)" }
    $pHeader = $rows[$p]
    $pHasTower = ($pHeader -join '|') -match '(?i)tower'

    for ($i = $p + 1; $i -lt $rows.Count; $i++) {
        $r = $rows[$i]
        if (-not $r[0] -or $r[0] -notmatch '^[A-Z]{2,4}\d{3}$') { continue }

        if ($pHasTower) {
            $parking += [ordered]@{
                id                    = $r[0]
                projectId             = $spec.Code
                tower                 = if ($r[2]) { $r[2] } else { $null }
                level                 = $r[3]
                parkingNo             = $r[4]
                parkingType           = $r[5]
                areaSqm               = ConvertTo-Number $r[6]
                purchasePriceCentavos = ConvertTo-Centavos $r[7]
                status                = if ($r[8]) { $r[8] } else { 'Available' }
            }
        }
        else {
            $parking += [ordered]@{
                id                    = $r[0]
                projectId             = $spec.Code
                tower                 = $null
                level                 = $r[2]
                parkingNo             = $r[3]
                parkingType           = $r[4]
                areaSqm               = ConvertTo-Number $r[5]
                purchasePriceCentavos = ConvertTo-Centavos $r[6]
                status                = if ($r[7]) { $r[7] } else { 'Available' }
            }
        }
    }
}

# ── Employees ────────────────────────────────────────────────────────────────

Write-Host "`nExtracting personnel from RBAC.xls"
$rbacPath = Join-Path $SourceDir 'RBAC.xls'
$employees = @()

foreach ($sheet in (Get-SheetNames -Path $rbacPath)) {
    if ($sheet -match 'USER ROLE ACCESS') { continue }
    $rows = Read-Sheet -Path $rbacPath -Sheet $sheet
    $h = Find-HeaderRow $rows 'Employee ID'
    if ($h -lt 0) { continue }

    for ($i = $h + 1; $i -lt $rows.Count; $i++) {
        $r = $rows[$i]
        if (-not $r[0] -or $r[0] -notmatch '^EMP\d{3}$') { continue }
        $position = $r[3]
        $employees += [ordered]@{
            id           = $r[0]
            fullName     = $r[1]
            department   = $r[2]
            position     = $position
            username     = $r[4]
            # Plaintext password from the workbook. Used ONCE to create the
            # Firebase Auth user, then discarded (Development Plan.md §12.3).
            seedPassword = $r[5]
            userRole     = $r[6]
            status       = $r[7]
            isSupervisor = [bool]($position -match '(?i)supervisor|administrator')
            sourceSheet  = ($sheet -replace '\$$', '' -replace "'", '')
        }
    }
}

# ── Sales organisation ───────────────────────────────────────────────────────

Write-Host "`nExtracting sales organisation from SALES STAFF DATABASE.xls"
$salesPath = Join-Path $SourceDir 'SALES STAFF DATABASE.xls'

$groupHeads = @()
$rows = Read-Sheet -Path $salesPath -Sheet "'GROUP HEAD`$'"
$h = Find-HeaderRow $rows 'Group Head ID'
for ($i = $h + 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    if (-not $r[0] -or $r[0] -notmatch '^GH\d{3}$') { continue }
    $groupHeads += [ordered]@{
        id = $r[0]; name = $r[1]; position = $r[2]
        mobile = $r[3]; email = $r[4]; status = $r[5]
    }
}

$brokers = @()
$rows = Read-Sheet -Path $salesPath -Sheet 'BROKERS$'
$h = Find-HeaderRow $rows 'Broker ID'
for ($i = $h + 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    if (-not $r[0] -or $r[0] -notmatch '^BR\d{3}$') { continue }
    $brokers += [ordered]@{
        id = $r[0]; name = $r[1]; prcLicenseNo = $r[2]
        mobile = $r[3]; email = $r[4]; groupHead = $r[5]; status = $r[6]
    }
}

$agents = @()
$rows = Read-Sheet -Path $salesPath -Sheet 'AGENTS$'
$h = Find-HeaderRow $rows 'Agent ID'
for ($i = $h + 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    if (-not $r[0] -or $r[0] -notmatch '^AG\d{3}$') { continue }
    $agents += [ordered]@{
        id = $r[0]; name = $r[1]; mobile = $r[2]; email = $r[3]
        broker = $r[4]; groupHead = $r[5]; status = $r[6]
    }
}

# ── Write ────────────────────────────────────────────────────────────────────

Write-Host "`nWriting fixtures to $OutDir"
Write-Json 'projects.json'      $projects
Write-Json 'units.json'         $units
Write-Json 'parking-slots.json' $parking
Write-Json 'employees.json'     $employees
Write-Json 'group-heads.json'   $groupHeads
Write-Json 'brokers.json'       $brokers
Write-Json 'agents.json'        $agents

# ── Validation ───────────────────────────────────────────────────────────────
# The counts below are stated in Development Plan.md §1.3 and were verified by
# hand against the workbooks. A silent mismatch here means the sheet layout
# changed and the extraction logic is reading the wrong columns.

Write-Host "`nValidating"
$failures = @()

function Assert-Count {
    param([string]$Label, [int]$Actual, [int]$Expected)
    $ok = $Actual -eq $Expected
    Write-Host ("  {0,-34} {1,4} / {2,-4} {3}" -f $Label, $Actual, $Expected, $(if ($ok) { 'OK' } else { 'MISMATCH' }))
    if (-not $ok) { $script:failures += "$Label expected $Expected, got $Actual" }
}

Assert-Count 'projects'        $projects.Count   5
Assert-Count 'units'           $units.Count      150
Assert-Count 'parking slots'   $parking.Count    125
Assert-Count 'employees'       $employees.Count  25
Assert-Count 'group heads'     $groupHeads.Count 3
Assert-Count 'brokers'         $brokers.Count    6
Assert-Count 'agents'          $agents.Count     12

foreach ($spec in $projectSheets) {
    $n = @($units | Where-Object { $_.projectId -eq $spec.Code }).Count
    Assert-Count "  units in $($spec.Code)" $n 30
}

# Every unit must carry a usable price, or the pricing engine has nothing to work with.
$noPrice = @($units | Where-Object { -not $_.purchasePriceCentavos -or $_.purchasePriceCentavos -le 0 })
Write-Host ("  {0,-34} {1,4}" -f 'units missing a price', $noPrice.Count)
if ($noPrice.Count -gt 0) {
    $failures += "$($noPrice.Count) unit(s) have no purchase price"
    $noPrice | Select-Object -First 5 | ForEach-Object { Write-Host "      $($_.id)" }
}

$noPrice = @($parking | Where-Object { -not $_.purchasePriceCentavos -or $_.purchasePriceCentavos -le 0 })
Write-Host ("  {0,-34} {1,4}" -f 'parking missing a price', $noPrice.Count)
if ($noPrice.Count -gt 0) { $failures += "$($noPrice.Count) parking slot(s) have no price" }

# Duplicate ids would silently overwrite each other during the Firestore load.
# Group-Object must be given a script block: these records are ordered
# hashtables, and Group-Object 'id' looks for a real property, finds none, and
# collapses every record into a single unnamed group.
$dupUnits = @($units | Group-Object { $_.id } | Where-Object { $_.Count -gt 1 })
Write-Host ("  {0,-34} {1,4}" -f 'duplicate unit ids', $dupUnits.Count)
if ($dupUnits.Count -gt 0) {
    $failures += "duplicate unit ids: $(($dupUnits | Select-Object -First 5 -ExpandProperty Name) -join ', ')"
}

$dupParking = @($parking | Group-Object { $_.id } | Where-Object { $_.Count -gt 1 })
Write-Host ("  {0,-34} {1,4}" -f 'duplicate parking ids', $dupParking.Count)
if ($dupParking.Count -gt 0) {
    $failures += "duplicate parking ids: $(($dupParking | Select-Object -First 5 -ExpandProperty Name) -join ', ')"
}

$dupEmployees = @($employees | Group-Object { $_.username } | Where-Object { $_.Count -gt 1 })
Write-Host ("  {0,-34} {1,4}" -f 'duplicate usernames', $dupEmployees.Count)
if ($dupEmployees.Count -gt 0) {
    $failures += "duplicate usernames: $(($dupEmployees | Select-Object -First 5 -ExpandProperty Name) -join ', ')"
}

if ($failures.Count -gt 0) {
    Write-Host "`nFAILED:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "`nAll checks passed."
