# GoPost Homebrew Formula
#
# Install with:
#   brew install berksunduri/GOPost/gopost
#
# Or tap then install:
#   brew tap berksunduri/GOPost
#   brew install gopost

class Gopost < Formula
  desc "Fast, native API client and test runner — a Postman alternative"
  homepage "https://github.com/berksunduri/GOPost"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/berksunduri/GOPost/releases/download/v#{version}/gopost-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256"
    else
      url "https://github.com/berksunduri/GOPost/releases/download/v#{version}/gopost-darwin-amd64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/berksunduri/GOPost/releases/download/v#{version}/gopost-linux-arm64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256"
    else
      url "https://github.com/berksunduri/GOPost/releases/download/v#{version}/gopost-linux-amd64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256"
    end
  end

  def install
    # Install CLI binary as `gopost`
    bin.install "gopost"

    # Install GUI app on macOS
    if OS.mac?
      prefix.install "GoPost.app"
    end

    # Generate shell completions
    output = Utils.safe_popen_read(bin/"gopost", "--help")
    # TODO: Add shell completion generation when implemented
  end

  test do
    # Verify CLI works
    assert_match "gopost #{version}", shell_output("#{bin}/gopost --version").strip

    # Verify run --help works
    system "#{bin}/gopost", "run", "--help"
  end

  def caveats
    <<~EOS
      GoPost desktop app is installed at:
        #{prefix}/GoPost.app

      To run API tests from the command line:
        gopost run my-collection --reporter junit --output results.xml

      To watch a .http file for changes:
        gopost watch ./api.http
    EOS
  end
end
