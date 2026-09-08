# Koppelt Claude aan de WordPress-sites van Mymmo.
#
# Dit script schrijft een klein instellingenbestand naar je gebruikersmap:
#   %USERPROFILE%\.mymmo-wp.json
#
# Je toepassingswachtwoord blijft op deze computer. Het gaat niet naar Claude,
# niet naar Anthropic en niet naar de Operations Manager: alleen de
# MCP-server die hier lokaal draait leest dit bestand.

$ErrorActionPreference = 'Stop'

# Een fout mag het venster niet dichtklappen voor je hem gelezen hebt.
trap {
    Write-Host ''
    Write-Host ('  FOUT: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ''
    Read-Host '  Druk op Enter om te sluiten'
    exit 1
}

Write-Host ''
Write-Host '  Claude koppelen aan WordPress' -ForegroundColor Cyan
Write-Host '  -----------------------------'
Write-Host ''
Write-Host '  Je hebt per site nodig:'
Write-Host '    - je WordPress-gebruikersnaam (van een beheerdersaccount)'
Write-Host '    - het toepassingswachtwoord dat je net hebt aangemaakt'
Write-Host ''
Write-Host '  Sla een site over door bij de gebruikersnaam gewoon op Enter te drukken.'
Write-Host ''

function Vraag-Site([string]$Sleutel, [string]$Url) {
    Write-Host ("  === {0} ({1})" -f $Sleutel, $Url) -ForegroundColor Yellow
    $gebruiker = Read-Host '  WordPress-gebruikersnaam'
    if ([string]::IsNullOrWhiteSpace($gebruiker)) {
        Write-Host '  (overgeslagen)'
        Write-Host ''
        return $null
    }

    # Het wachtwoord wordt niet op het scherm getoond terwijl je het typt.
    $veilig = Read-Host '  Toepassingswachtwoord' -AsSecureString
    $wachtwoord = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($veilig)
    )

    if ([string]::IsNullOrWhiteSpace($wachtwoord)) {
        Write-Host '  Geen wachtwoord ingevuld, site overgeslagen.' -ForegroundColor Red
        Write-Host ''
        return $null
    }

    Write-Host ''
    return [ordered]@{
        key         = $Sleutel
        url         = $Url
        user        = $gebruiker.Trim()
        appPassword = $wachtwoord.Trim()
    }
}

$sites = @()
foreach ($paar in @(@('openvme', 'https://openvme.be'), @('syndicoach', 'https://syndicoach.be'))) {
    $site = Vraag-Site $paar[0] $paar[1]
    if ($site) { $sites += $site }
}

if ($sites.Count -eq 0) {
    Write-Host '  Er is geen enkele site ingevuld. Er is niets opgeslagen.' -ForegroundColor Red
    Write-Host ''
    Read-Host '  Druk op Enter om te sluiten'
    exit 1
}

$pad = Join-Path $env:USERPROFILE '.mymmo-wp.json'
# @( ) er expliciet om: in PowerShell 5.1 kan een lijst van EEN element
# anders als los object in de JSON belanden, en dan vindt de server geen
# enkele site.
$json = [ordered]@{ sites = @($sites) } | ConvertTo-Json -Depth 5

# UTF-8 zonder BOM: Node struikelt over een BOM aan het begin van JSON.
[System.IO.File]::WriteAllText($pad, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ('  Opgeslagen: {0}' -f $pad) -ForegroundColor Green
Write-Host ('  Sites: {0}' -f (($sites | ForEach-Object { $_.key }) -join ', '))
Write-Host ''
Write-Host '  Klaar. Vraag Claude nu: "antwoorden onze WordPress-sites?"'
Write-Host ''
Write-Host '  Wil je de koppeling later weer dicht: verwijder dit bestand, of trek'
Write-Host '  het toepassingswachtwoord in bij Gebruikers - Profiel in WordPress.'
Write-Host ''
Read-Host '  Druk op Enter om te sluiten'
