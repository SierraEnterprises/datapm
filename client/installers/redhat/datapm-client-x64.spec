Name:           datapm-client
Version:        x.x.x
Release:        1%{?dist}
Summary:        A simple hello world script
BuildArch:      x86_64
URL:            https://datapm.io
License:        https://datapm.io/docs/license
Source0:        %{name}-%{version}-source.tar.gz

Requires:       bash libsecret

%description
DataPM is a package manager for data. See more at https://datapm.io

%prep
%setup
rm -rf $RPM_BUILD_ROOT
mkdir -p build/BUILDROOT/datapm-client-${DATAPM_VERSION}
cp -R ../../../../pkg-linux-intel64/* build/BUILDROOT/datapm-client-${DATAPM_VERSION}./

%install


%clean
rm -rf $RPM_BUILD_ROOT

%files
%{_bindir}/datapm

%changelog
* Mon Feb 07 2021 Travis Collins <hello@datapm.io> - 0.0.1
- These changelogs are not maintained.